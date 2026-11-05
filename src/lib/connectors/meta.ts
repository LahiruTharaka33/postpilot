import { graph, GraphError } from "../meta";
import type { PlatformConnector, PublishRequest, PublishResult } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Media = PublishRequest["media"][number];

/** Meta downloads media from its URL, so files kept on this computer (no R2) can't be published. */
function localFileError(label: string, media: Media[]): PublishResult | null {
  if (media.every((m) => /^https?:\/\//.test(m.url))) return null;
  return {
    ok: false,
    retryable: false,
    error: `${label}: this file is stored on the PostPilot server, where ${label} can't download it. Set up R2 media storage and upload it again.`,
  };
}

function failure(label: string, e: unknown): PublishResult {
  if (e instanceof GraphError) {
    const error = e.needsReconnect ? `${label}: access expired or was removed (${e.message}). Reconnect the account.` : `${label}: ${e.message}`;
    return { ok: false, error, retryable: e.retryable, needsReconnect: e.needsReconnect };
  }
  return { ok: false, error: `${label}: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
}

function missingAccount(label: string, req: PublishRequest): PublishResult | null {
  if (req.account.externalId && req.account.accessToken) return null;
  return { ok: false, error: `${label}: the account isn't connected. Reconnect it.`, retryable: false, needsReconnect: true };
}

abstract class MetaConnector implements PlatformConnector {
  abstract platform: "FACEBOOK" | "INSTAGRAM";
  provider = "META";

  async connect(): Promise<{ accessToken: string }> {
    throw new Error("Facebook and Instagram accounts are connected with Facebook sign-in");
  }

  async getProfile(account: PublishRequest["account"]) {
    return { handle: account.handle, displayName: account.handle };
  }

  abstract publish(req: PublishRequest): Promise<PublishResult>;

  /** Posts the first comment. Best effort: the post is already live, so a failure here doesn't fail it. */
  protected async firstComment(objectId: string, message: string | undefined, token: string) {
    if (!message?.trim()) return;
    try {
      await graph("POST", `${objectId}/comments`, { message, access_token: token });
    } catch (e) {
      console.warn(`[${this.platform}] first comment failed`, objectId, e instanceof Error ? e.message : e);
    }
  }
}

/** Publishes to a Facebook Page with the Page's token. */
export class FacebookConnector extends MetaConnector {
  platform = "FACEBOOK" as const;

  async publish(req: PublishRequest): Promise<PublishResult> {
    const label = "Facebook";
    const invalid = missingAccount(label, req) ?? localFileError(label, req.media);
    if (invalid) return invalid;
    const pageId = req.account.externalId!;
    const token = req.account.accessToken!;
    const message = req.caption.trim() || undefined;
    const videos = req.media.filter((m) => m.type === "VIDEO");
    const images = req.media.filter((m) => m.type === "IMAGE");

    try {
      let postId: string;
      let url: string;
      if (videos.length > 0) {
        if (req.media.length > 1) return { ok: false, retryable: false, error: `${label}: a post with a video can only have that one video` };
        const res = await graph<{ id: string }>("POST", `${pageId}/videos`, { file_url: videos[0].url, description: message, access_token: token });
        postId = res.id;
        url = `https://www.facebook.com/${pageId}/videos/${res.id}`;
      } else if (images.length === 1) {
        const res = await graph<{ id: string; post_id?: string }>("POST", `${pageId}/photos`, { url: images[0].url, caption: message, access_token: token });
        postId = res.post_id ?? res.id;
        url = `https://www.facebook.com/${postId}`;
      } else if (images.length > 1) {
        // Several photos: upload each unpublished, then make one post with all of them.
        const ids: string[] = [];
        for (const img of images) {
          const res = await graph<{ id: string }>("POST", `${pageId}/photos`, { url: img.url, published: "false", access_token: token });
          ids.push(res.id);
        }
        const attached = Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
        const res = await graph<{ id: string }>("POST", `${pageId}/feed`, { message, ...attached, access_token: token });
        postId = res.id;
        url = `https://www.facebook.com/${postId}`;
      } else {
        if (!message) return { ok: false, retryable: false, error: `${label}: the post is empty` };
        const res = await graph<{ id: string }>("POST", `${pageId}/feed`, { message, access_token: token });
        postId = res.id;
        url = `https://www.facebook.com/${postId}`;
      }
      await this.firstComment(postId, req.options.firstComment, token);
      return { ok: true, externalId: postId, url };
    } catch (e) {
      return failure(label, e);
    }
  }
}

/**
 * Publishes to an Instagram professional account through its linked Facebook Page's token.
 * Instagram works in two steps: create a media container, wait until it's processed, then publish it.
 */
export class InstagramConnector extends MetaConnector {
  platform = "INSTAGRAM" as const;

  constructor(
    private pollMs = 3_000,
    private maxWaitMs = 90_000,
  ) {
    super();
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const label = "Instagram";
    const invalid = missingAccount(label, req) ?? localFileError(label, req.media);
    if (invalid) return invalid;
    if (req.media.length === 0) return { ok: false, retryable: false, error: `${label}: a post needs at least one photo or video` };
    if (req.media.length > 10) return { ok: false, retryable: false, error: `${label}: a carousel can have at most 10 items` };
    const igId = req.account.externalId!;
    const token = req.account.accessToken!;
    const caption = req.caption.trim() || undefined;

    try {
      let creationId: string;
      if (req.media.length === 1) {
        creationId = await this.container(igId, token, req.media[0], { caption });
      } else {
        const children: string[] = [];
        for (const m of req.media) children.push(await this.container(igId, token, m, { is_carousel_item: "true" }));
        creationId = await this.container(igId, token, null, { media_type: "CAROUSEL", children: children.join(","), caption });
      }
      const published = await graph<{ id: string }>("POST", `${igId}/media_publish`, { creation_id: creationId, access_token: token });
      const url = await graph<{ permalink?: string }>("GET", published.id, { fields: "permalink", access_token: token })
        .then((r) => r.permalink ?? "https://www.instagram.com/")
        .catch(() => "https://www.instagram.com/");
      await this.firstComment(published.id, req.options.firstComment, token);
      return { ok: true, externalId: published.id, url };
    } catch (e) {
      return failure(label, e);
    }
  }

  /** Creates one media container and waits until Instagram has processed it. */
  private async container(igId: string, token: string, media: Media | null, extra: Record<string, string | undefined>) {
    // Instagram publishes every video as a Reel; with share_to_feed it also shows in the main grid.
    const fields =
      media === null ? {} : media.type === "VIDEO" ? { media_type: extra.is_carousel_item ? "VIDEO" : "REELS", video_url: media.url } : { image_url: media.url };
    const { id } = await graph<{ id: string }>("POST", `${igId}/media`, { ...fields, ...extra, access_token: token });
    await this.waitUntilReady(id, token);
    return id;
  }

  private async waitUntilReady(containerId: string, token: string) {
    const deadline = Date.now() + this.maxWaitMs;
    for (;;) {
      const { status_code, status } = await graph<{ status_code?: string; status?: string }>("GET", containerId, {
        fields: "status_code,status",
        access_token: token,
      });
      if (status_code === "FINISHED" || status_code === "PUBLISHED" || status_code === undefined) return;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new GraphError(`couldn't process the media (${status ?? status_code}). Check its size and aspect ratio.`);
      }
      if (Date.now() >= deadline) throw new GraphError("the media is still processing", undefined, undefined, true);
      await sleep(this.pollMs);
    }
  }
}
