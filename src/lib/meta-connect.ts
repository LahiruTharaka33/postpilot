import "server-only";
import { cookies } from "next/headers";
import { decryptToken, encryptToken } from "./crypto";

// Between Facebook's login and the page picker, the person's user token waits in an encrypted,
// short-lived cookie, so it never sits in the database.
const STATE_COOKIE = "meta_oauth_state";
const PENDING_COOKIE = "meta_connect";
const MAX_AGE = 15 * 60;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

/** Remembers which workspace started the login, and a random value Facebook must send back. */
export async function saveLoginState(state: string, slug: string) {
  (await cookies()).set(STATE_COOKIE, encryptToken(JSON.stringify({ state, slug })), cookieOptions);
}

/** The workspace slug if `state` matches the one saved at the start of the login, else null. Single use. */
export async function takeLoginState(state: string | null) {
  const store = await cookies();
  const raw = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  if (!raw || !state) return null;
  try {
    const saved = JSON.parse(decryptToken(raw) ?? "") as { state: string; slug: string };
    return saved.state === state ? saved.slug : null;
  } catch {
    return null;
  }
}

export async function savePendingConnection(slug: string, userToken: string) {
  const value = encryptToken(JSON.stringify({ slug, userToken, exp: Date.now() + MAX_AGE * 1000 }));
  (await cookies()).set(PENDING_COOKIE, value, cookieOptions);
}

/** The user token waiting for this workspace's page picker, or null if there is none or it expired. */
export async function getPendingConnection(slug: string) {
  const raw = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!raw) return null;
  try {
    const p = JSON.parse(decryptToken(raw) ?? "") as { slug: string; userToken: string; exp: number };
    return p.slug === slug && p.exp > Date.now() ? p.userToken : null;
  } catch {
    return null;
  }
}

export async function clearPendingConnection() {
  (await cookies()).delete(PENDING_COOKIE);
}
