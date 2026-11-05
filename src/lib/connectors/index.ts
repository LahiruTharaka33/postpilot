import type { Platform } from "../platforms";
import { FacebookConnector, InstagramConnector } from "./meta";
import { MockConnector } from "./mock";
import type { PlatformConnector } from "./types";

const registry = new Map<string, PlatformConnector>();
const key = (provider: string, platform: Platform) => `${provider}:${platform}`;

/** Returns the connector for an account's provider and platform. Accounts without a real provider use the mocks. */
export function getConnector(platform: Platform, provider = "MOCK"): PlatformConnector {
  let connector = registry.get(key(provider, platform));
  if (!connector) {
    if (provider === "META" && platform === "FACEBOOK") connector = new FacebookConnector();
    else if (provider === "META" && platform === "INSTAGRAM") connector = new InstagramConnector();
    else connector = new MockConnector(platform);
    registry.set(key(provider, platform), connector);
  }
  return connector;
}

export function registerConnector(connector: PlatformConnector) {
  registry.set(key(connector.provider ?? "MOCK", connector.platform), connector);
}

export type { PlatformConnector, PublishRequest, PublishResult } from "./types";
