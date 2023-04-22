import type { BungieApiClient } from "@workers-utils/bungie";
import { BungieApiError, getBungieApiClient } from "@workers-utils/bungie";
import { JsonResponse } from "@workers-utils/common";
import type { PlatformErrorCodes } from "bungie-api-ts/core";

import { arrayDiff } from "../arrayDiff";
import type { BungieApiWebhooksWorkerEnv } from "../types";

export class ApiStatusChecker implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: BungieApiWebhooksWorkerEnv
  ) {
    this.bungieClient = getBungieApiClient({
      apiKey: env.BUNGIE_API_KEY,
      apiOrigin: env.BUNGIE_API_ORIGIN,
      definitions: env.DESTINY_DEFINITIONS,
    });
  }

  private bungieClient: BungieApiClient;

  async fetch(request: Request) {
    const body = (await request.json()) as
      | { method: "fetch" }
      | { method: "scheduled"; cron: string; scheduledTime: string };

    let lastErrorCode: PlatformErrorCodes | null = null;
    let lastErrorStatus: string | null = null;
    const enabledSystems: string[] = [];
    const disabledSystems: string[] = [];

    const oldStatus = await this.state.storage.list();

    try {
      const commonSettings = await this.bungieClient.getCommonSettings();
      lastErrorCode = commonSettings.ErrorCode;
      lastErrorStatus = commonSettings.ErrorStatus;

      for (const [systemName, metadata] of Object.entries(
        commonSettings.Response.systems
      ).sort(([a], [b]) => a.localeCompare(b))) {
        if (metadata.enabled) {
          enabledSystems.push(systemName);
        } else {
          disabledSystems.push(systemName);
        }

        if (body.method === "scheduled" && this.env.BUNGIE_API_STATUS) {
          this.env.API_STATUS_QUEUE.send({
            blobs: [systemName],
            doubles: [metadata.enabled ? 1 : 0],
            indexes: [systemName],
          });
        } else {
          console.log("System:", metadata.enabled ? "✅" : "⛔", systemName);
        }
      }

      const oldEnabledSystems = oldStatus.get("enabledSystems");
      const enabledSystemsChanges = arrayDiff(
        Array.isArray(oldEnabledSystems) ? oldEnabledSystems : [],
        enabledSystems
      );

      if (
        oldStatus.get("lastErrorCode") !== lastErrorCode ||
        oldStatus.get("lastErrorStatus") !== lastErrorStatus ||
        enabledSystemsChanges.onlyInA.length !== 0 ||
        enabledSystemsChanges.onlyInB.length !== 0
      ) {
        await this.state.storage.put({
          lastErrorCode,
          lastErrorStatus,
          enabledSystems,
          disabledSystems,
        });
      }

      return new JsonResponse({
        lastErrorCode,
        lastErrorStatus,
        statusWasUpdated: oldStatus.get("lastErrorCode") !== lastErrorCode,
        newlyEnabledSystems: enabledSystemsChanges.onlyInB,
        newlyDisabledSystems: enabledSystemsChanges.onlyInA,
        unchangedEnabledSystems: enabledSystemsChanges.inBoth,
      });
    } catch (error) {
      if (error instanceof BungieApiError) {
        console.error(
          "Bungie API error: %s (%s)",
          error.errorStatus,
          error.errorCode
        );
        lastErrorCode = error.errorCode;
        lastErrorStatus = error.errorStatus;
      } else {
        console.error(error);
      }

      await this.state.storage.put({
        lastErrorCode,
        lastErrorStatus,
      });

      return new JsonResponse({
        lastErrorCode,
        lastErrorStatus,
        statusWasUpdated: oldStatus.get("lastErrorCode") !== lastErrorCode,
        error,
      });
    }
  }
}
