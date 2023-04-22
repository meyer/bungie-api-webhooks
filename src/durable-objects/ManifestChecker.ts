import type { BungieApiClient } from "@workers-utils/bungie";
import { BungieApiError, getBungieApiClient } from "@workers-utils/bungie";
import { JsonResponse } from "@workers-utils/common";

import type { BungieApiWebhooksWorkerEnv } from "../types";

const manifestVersionKey = "manifestVersion";

export class ManifestChecker implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: BungieApiWebhooksWorkerEnv
  ) {
    state.blockConcurrencyWhile(async () => {
      const value = await state.storage.get(manifestVersionKey);
      if (typeof value === "string") {
        this.manifestVersion = value;
      }
    });
    this.bungieClient = getBungieApiClient({
      apiKey: env.BUNGIE_API_KEY,
      apiOrigin: env.BUNGIE_API_ORIGIN,
      definitions: env.DESTINY_DEFINITIONS,
    });
  }

  private bungieClient: BungieApiClient;

  private manifestVersion: string | null = null;

  async fetch(request: Request) {
    try {
      const body = (await request.json()) as
        | { method: "fetch" }
        | { method: "scheduled"; cron: string; scheduledTime: string };

      const manifest = await this.bungieClient.getDestinyManifest();
      if (manifest.Response.version !== this.manifestVersion) {
        this.manifestVersion = manifest.Response.version;
        await this.state.storage.put(manifestVersionKey, this.manifestVersion);
        return new JsonResponse({
          manifestVersion: manifest.Response.version,
          versionWasUpdated: true,
        });
      }

      if (body.method === "scheduled" && this.env.BUNGIE_MANIFEST_STATUS) {
        this.env.BUNGIE_MANIFEST_STATUS.writeDataPoint({
          blobs: [manifest.Response.version],
          doubles: [manifest.ErrorCode],
        });
      } else {
        console.log("manifestVersion", manifest.Response.version);
      }

      return new JsonResponse({
        manifestVersion: manifest.Response.version,
        versionWasUpdated: false,
      });
    } catch (error) {
      if (error instanceof BungieApiError) {
        return new JsonResponse({
          bungieErrorCode: error.errorCode,
          bungieErrorStatus: error.errorStatus,
        });
      }

      return new JsonResponse({
        error: "" + error,
      });
    }
  }
}
