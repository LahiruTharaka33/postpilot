import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { graphError } from "@/lib/meta";
import { FacebookConnector, InstagramConnector } from "@/lib/connectors/meta";
import type { PublishRequest } from "@/lib/connectors";

type Call = { method: string; path: string; params: Record<string, string> };

/** Replaces fetch with a fake Graph API. `reply` gets each call and returns the JSON body (or throws an error body). */
function fakeGraph(reply: (c: Call) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const params = Object.fromEntries(method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body)));
    const call = { method, path: url.pathname.replace(/^\/v[\d.]+\//, ""), params };
    calls.push(call);
    const body = reply(call) as { error?: unknown };
    return new Response(JSON.stringify(body), { status: body?.error ? 400 : 200 });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const img = (n: number) => ({ url: `https://media.test/${n}.jpg`, type: "IMAGE" as const });
const request = (over: Partial<PublishRequest> = {}): PublishRequest => ({
  account: { id: "a1", handle: "brand", accessToken: "page-token", externalId: "123" },
  caption: "Hello",
  media: [],
  options: {},
  ...over,
});

describe("token encryption", () => {
  it("round-trips and leaves mock placeholders alone", () => {
    const stored = encryptToken("secret-token");
    expect(stored).not.toContain("secret-token");
    expect(decryptToken(stored)).toBe("secret-token");
    expect(decryptToken("mock-token-x")).toBe("mock-token-x");
    expect(decryptToken(null)).toBeNull();
  });

  it("rejects a tampered token", () => {
    const stored = encryptToken("secret-token");
    expect(() => decryptToken(stored.slice(0, -2) + (stored.endsWith("A") ? "BB" : "AA"))).toThrow();
  });
});

describe("graphError", () => {
  it("sorts errors into retry, reconnect and give up", () => {
    expect(graphError(400, { error: { message: "limit", code: 4 } }).retryable).toBe(true);
    expect(graphError(500, {}).retryable).toBe(true);
    const expired = graphError(400, { error: { message: "expired", code: 190 } });
    expect(expired.needsReconnect).toBe(true);
    expect(expired.retryable).toBe(false);
    expect(graphError(400, { error: { message: "bad image", code: 100 } }).retryable).toBe(false);
  });
});

describe("FacebookConnector", () => {
  it("posts text to the Page feed", async () => {
    const calls = fakeGraph(() => ({ id: "123_9" }));
    const res = await new FacebookConnector().publish(request());
    expect(res).toEqual({ ok: true, externalId: "123_9", url: "https://www.facebook.com/123_9" });
    expect(calls[0]).toMatchObject({ method: "POST", path: "123/feed", params: { message: "Hello", access_token: "page-token" } });
  });

  it("posts one photo with its caption", async () => {
    const calls = fakeGraph(() => ({ id: "p1", post_id: "123_5" }));
    const res = await new FacebookConnector().publish(request({ media: [img(1)] }));
    expect(res).toMatchObject({ ok: true, externalId: "123_5" });
    expect(calls[0]).toMatchObject({ path: "123/photos", params: { url: "https://media.test/1.jpg", caption: "Hello" } });
  });

  it("uploads several photos unpublished, then attaches them to one post", async () => {
    let n = 0;
    const calls = fakeGraph((c) => (c.path === "123/photos" ? { id: `ph${++n}` } : { id: "123_7" }));
    const res = await new FacebookConnector().publish(request({ media: [img(1), img(2)] }));
    expect(res).toMatchObject({ ok: true, externalId: "123_7" });
    expect(calls.map((c) => c.path)).toEqual(["123/photos", "123/photos", "123/feed"]);
    expect(calls[0].params.published).toBe("false");
    expect(calls[2].params["attached_media[1]"]).toBe(JSON.stringify({ media_fbid: "ph2" }));
  });

  it("adds the first comment, and a failed comment doesn't fail the post", async () => {
    const calls = fakeGraph((c) => (c.path.endsWith("/comments") ? { error: { message: "no permission", code: 200 } } : { id: "123_9" }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await new FacebookConnector().publish(request({ options: { firstComment: "Link in bio" } }));
    expect(res.ok).toBe(true);
    expect(calls[1]).toMatchObject({ path: "123_9/comments", params: { message: "Link in bio" } });
  });

  it("refuses files that only exist on the server", async () => {
    const calls = fakeGraph(() => ({}));
    const res = await new FacebookConnector().publish(request({ media: [{ url: "/api/media/x.jpg", type: "IMAGE" }] }));
    expect(res).toMatchObject({ ok: false, retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("asks for a reconnect when the token is no longer valid", async () => {
    fakeGraph(() => ({ error: { message: "Session has expired", code: 190 } }));
    const res = await new FacebookConnector().publish(request());
    expect(res).toMatchObject({ ok: false, retryable: false, needsReconnect: true });
  });
});

describe("InstagramConnector", () => {
  const ig = () => new InstagramConnector(0, 50);

  it("creates a container, waits for it, publishes and reads the permalink", async () => {
    let checks = 0;
    const calls = fakeGraph((c) => {
      if (c.path === "123/media") return { id: "c1" };
      if (c.path === "c1") return { status_code: ++checks < 2 ? "IN_PROGRESS" : "FINISHED" };
      if (c.path === "123/media_publish") return { id: "m1" };
      if (c.path === "m1") return { permalink: "https://www.instagram.com/p/abc/" };
      throw new Error(`unexpected ${c.path}`);
    });
    const res = await ig().publish(request({ media: [img(1)] }));
    expect(res).toEqual({ ok: true, externalId: "m1", url: "https://www.instagram.com/p/abc/" });
    expect(calls[0].params).toMatchObject({ image_url: "https://media.test/1.jpg", caption: "Hello" });
    expect(calls.find((c) => c.path === "123/media_publish")?.params.creation_id).toBe("c1");
  });

  it("publishes a video as a Reel", async () => {
    const calls = fakeGraph((c) => (c.path === "123/media" ? { id: "c1" } : c.path === "123/media_publish" ? { id: "m1" } : { status_code: "FINISHED" }));
    await ig().publish(request({ media: [{ url: "https://media.test/v.mp4", type: "VIDEO" }] }));
    expect(calls[0].params).toMatchObject({ media_type: "REELS", video_url: "https://media.test/v.mp4" });
  });

  it("builds a carousel from child containers", async () => {
    let n = 0;
    const calls = fakeGraph((c) => {
      if (c.path === "123/media") return { id: `c${++n}` };
      if (c.path === "123/media_publish") return { id: "m1" };
      return { status_code: "FINISHED", permalink: "https://www.instagram.com/p/x/" };
    });
    const res = await ig().publish(request({ media: [img(1), img(2)] }));
    expect(res.ok).toBe(true);
    const creates = calls.filter((c) => c.path === "123/media");
    expect(creates[0].params.is_carousel_item).toBe("true");
    expect(creates[2].params).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2", caption: "Hello" });
  });

  it("needs at least one photo or video", async () => {
    const res = await ig().publish(request());
    expect(res).toMatchObject({ ok: false, retryable: false });
  });

  it("gives up on media Instagram can't process, and retries media still processing", async () => {
    fakeGraph((c) => (c.path === "123/media" ? { id: "c1" } : { status_code: "ERROR", status: "bad ratio" }));
    expect(await ig().publish(request({ media: [img(1)] }))).toMatchObject({ ok: false, retryable: false });

    fakeGraph((c) => (c.path === "123/media" ? { id: "c1" } : { status_code: "IN_PROGRESS" }));
    expect(await ig().publish(request({ media: [img(1)] }))).toMatchObject({ ok: false, retryable: true });
  });
});
