import type { Platform } from "../platforms";
import type { PlatformConnector, PublishRequest, PublishResult } from "./types";

const POST_URLS: Record<Platform, (handle: string, id: string) => string> = {
  FACEBOOK: (h, id) => `https://facebook.com/${h}/posts/${id}`,
  INSTAGRAM: (_h, id) => `https://instagram.com/p/${id}`,
  TIKTOK: (h, id) => `https://tiktok.com/@${h}/video/${id}`,
  X: (h, id) => `https://x.com/${h}/status/${id}`,
  LINKEDIN: (_h, id) => `https://linkedin.com/feed/update/urn:li:share:${id}`,
  YOUTUBE: (_h, id) => `https://youtube.com/shorts/${id}`,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Simulates a platform API: short delay, random failures, fake post URLs. Nothing leaves the machine. */
export class MockConnector implements PlatformConnector {
  constructor(
    public platform: Platform,
    private failRate = Number(process.env.MOCK_FAIL_RATE ?? 0.1),
    private delayMs: [number, number] = [200, 900],
  ) {}

  async connect(handle: string) {
    return { accessToken: `mock-token-${this.platform.toLowerCase()}-${handle}` };
  }

  async getProfile(account: PublishRequest["account"]) {
    return { handle: account.handle, displayName: account.handle };
  }

  async publish(req: PublishRequest): Promise<PublishResult> {
    const [min, max] = this.delayMs;
    await sleep(min + Math.random() * (max - min));

    // "#fail" in a caption forces a failure so the retry flow is easy to try.
    if (req.caption.includes("#fail")) {
      return { ok: false, error: `${this.platform}: forced failure (#fail in caption)`, retryable: true };
    }
    if (Math.random() < this.failRate) {
      return { ok: false, error: `${this.platform}: simulated API timeout`, retryable: true };
    }
    const id = Math.random().toString(36).slice(2, 12);
    return { ok: true, externalId: id, url: POST_URLS[this.platform](req.account.handle, id) };
  }
}
