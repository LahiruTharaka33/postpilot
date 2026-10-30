import type { Platform, PlatformOptions } from "../platforms";

export interface PublishRequest {
  account: { id: string; handle: string; accessToken: string | null };
  caption: string;
  media: Array<{ url: string; type: "IMAGE" | "VIDEO" }>;
  options: PlatformOptions;
}

export type PublishResult = { ok: true; externalId: string; url: string } | { ok: false; error: string; retryable: boolean };

/**
 * One implementation per platform. v1 ships MockConnector for all of them;
 * real API connectors (Meta Graph, TikTok Content Posting, X, LinkedIn, YouTube Data) implement the same interface.
 */
export interface PlatformConnector {
  platform: Platform;
  /** Exchanges an OAuth code for tokens. Mock connectors return a placeholder. */
  connect(handle: string): Promise<{ accessToken: string }>;
  getProfile(account: PublishRequest["account"]): Promise<{ handle: string; displayName: string }>;
  publish(req: PublishRequest): Promise<PublishResult>;
}
