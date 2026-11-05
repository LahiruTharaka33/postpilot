/** Meta (Facebook + Instagram) Graph API settings and helpers shared by the login flow and the connectors. */

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** The Meta app's settings, or null when they aren't all set (Facebook connect is then hidden). */
export function metaConfig() {
  const { META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID } = process.env;
  if (!META_APP_ID || !META_APP_SECRET || !META_LOGIN_CONFIG_ID) return null;
  return { appId: META_APP_ID, appSecret: META_APP_SECRET, configId: META_LOGIN_CONFIG_ID };
}

export type MetaConfig = NonNullable<ReturnType<typeof metaConfig>>;

/** The redirect address registered in the Meta app. APP_URL wins so it matches exactly behind proxies. */
export function metaRedirectUri(requestOrigin: string) {
  return `${(process.env.APP_URL ?? requestOrigin).replace(/\/$/, "")}/api/connect/meta/callback`;
}

/** Facebook's login dialog, using the Facebook Login for Business configuration (it sets the permissions). */
export function metaLoginUrl(config: MetaConfig, redirectUri: string, state: string) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: redirectUri,
    config_id: config.configId,
    response_type: "code",
    state,
  }).toString();
  return url.toString();
}

/** An error returned by the Graph API, with whether trying again later can help. */
export class GraphError extends Error {
  constructor(
    message: string,
    public code?: number,
    public subcode?: number,
    public retryable = false,
    /** The token is no longer valid; the account must be connected again. */
    public needsReconnect = false,
  ) {
    super(message);
  }
}

// Rate limits and temporary errors: https://developers.facebook.com/docs/graph-api/guides/error-handling
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613, 80001, 80002]);

export function graphError(status: number, body: unknown): GraphError {
  const e = (body as { error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string } })?.error;
  const message = e?.error_user_msg || e?.message || `HTTP ${status}`;
  // 190: expired or revoked token (password change, app removed, lost Page role).
  const needsReconnect = e?.code === 190 || e?.code === 102;
  const retryable = !needsReconnect && (status >= 500 || !!e?.is_transient || RETRYABLE_CODES.has(e?.code ?? -1));
  return new GraphError(message, e?.code, e?.error_subcode, retryable, needsReconnect);
}

/** Calls the Graph API. GET sends params in the query; POST sends them as a form. */
export async function graph<T>(method: "GET" | "POST", path: string, params: Record<string, string | undefined>): Promise<T> {
  const clean = Object.fromEntries(Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined));
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  let res: Response;
  try {
    if (method === "GET") {
      url.search = new URLSearchParams(clean).toString();
      res = await fetch(url, { cache: "no-store" });
    } else {
      res = await fetch(url, { method: "POST", body: new URLSearchParams(clean), cache: "no-store" });
    }
  } catch (e) {
    throw new GraphError(`network error (${e instanceof Error ? e.message : String(e)})`, undefined, undefined, true);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || (body as { error?: unknown })?.error) throw graphError(res.status, body);
  return body as T;
}

/** Turns the login dialog's code into a long-lived (about 60 days) user token. */
export async function exchangeCode(config: MetaConfig, redirectUri: string, code: string) {
  const short = await graph<{ access_token: string }>("GET", "oauth/access_token", {
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const long = await graph<{ access_token: string }>("GET", "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: short.access_token,
  });
  return long.access_token;
}

export interface MetaPage {
  id: string;
  name: string;
  username?: string;
  /** Page token. Made from a long-lived user token, it doesn't expire. */
  accessToken: string;
  pictureUrl?: string;
  instagram?: { id: string; username: string; pictureUrl?: string };
}

/** The Pages the person allowed PostPilot to use, each with its linked Instagram professional account. */
export async function listPages(userToken: string): Promise<MetaPage[]> {
  type Raw = {
    id: string;
    name: string;
    username?: string;
    access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  };
  const pages: MetaPage[] = [];
  let after: string | undefined;
  do {
    const res = await graph<{ data: Raw[]; paging?: { cursors?: { after?: string }; next?: string } }>("GET", "me/accounts", {
      access_token: userToken,
      fields: "id,name,username,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
      limit: "100",
      after,
    });
    for (const p of res.data) {
      const ig = p.instagram_business_account;
      pages.push({
        id: p.id,
        name: p.name,
        username: p.username,
        accessToken: p.access_token,
        pictureUrl: p.picture?.data?.url,
        instagram: ig ? { id: ig.id, username: ig.username ?? ig.id, pictureUrl: ig.profile_picture_url } : undefined,
      });
    }
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
  } while (after);
  return pages;
}
