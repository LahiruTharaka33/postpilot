import type { Platform } from "../platforms";
import { MockConnector } from "./mock";
import type { PlatformConnector } from "./types";

const registry = new Map<Platform, PlatformConnector>();

/** Returns the connector for a platform. Register real connectors here to replace the mocks. */
export function getConnector(platform: Platform): PlatformConnector {
  let connector = registry.get(platform);
  if (!connector) {
    connector = new MockConnector(platform);
    registry.set(platform, connector);
  }
  return connector;
}

export function registerConnector(connector: PlatformConnector) {
  registry.set(connector.platform, connector);
}

export type { PlatformConnector, PublishRequest, PublishResult } from "./types";
