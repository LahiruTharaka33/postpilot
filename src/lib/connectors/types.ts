import type { Platform, PlatformOptions } from "../platforms";

export interface PublishRequest {
  /** accessToken is already decrypted. externalId is the network's own id (Page id, Instagram user id). */
  account: { id: string; handle: string; accessToken: string | null; externalId?: string | null };
  caption: string;
  media: Array<{ url: string; type: "IMAGE" | "VIDEO" }>;
  options: PlatformOptions;
}

export type PublishResult =
  | { ok: true; externalId: string; url: string }
  /** needsReconnect: the token stopped working, so the account must be connected again. */
  | { ok: false; error: string; retryable: boolean; needsReconnect?: boolean };

/**
 * One implementation per platform and provider. MOCK connectors simulate every network;
 * real API connectors (Meta Graph today; TikTok, X, LinkedIn, YouTube later) implement the same interface.
 */
export interface PlatformConnector {
  platform: Platform;
  /** "MOCK" (the default) or the real API provider, matching SocialAccount.provider. */
  provider?: string;
  /** Mock connectors make a placeholder token. Real connectors get theirs from an OAuth sign-in instead. */
  connect(handle: string): Promise<{ accessToken: string }>;
  getProfile(account: PublishRequest["account"]): Promise<{ handle: string; displayName: string }>;
  publish(req: PublishRequest): Promise<PublishResult>;
}
