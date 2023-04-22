import { JsonResponse } from "@workers-utils/common";

import { checkStatus } from "./checkStatus";
import type { BungieApiWebhooksWorkerEnv } from "./types";

export { ApiStatusChecker } from "./durable-objects/ApiStatusChecker";
export { ArticleChecker } from "./durable-objects/ArticleChecker";
export { ManifestChecker } from "./durable-objects/ManifestChecker";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("🤔");
    }

    if (url.pathname === "/where-twab") {
      return new Response("WHERE TWAB");
    }

    if (url.pathname === "/check-status") {
      const status = await checkStatus(env, { method: "fetch" });
      return new JsonResponse(status);
    }

    return new Response("Hello!", { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    await checkStatus(env, {
      method: "scheduled",
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    });
  },

  async queue(batch, env, ctx) {
    for (const item of batch.messages) {
      if (
        "blobs" in item.body ||
        "doubles" in item.body ||
        "indexes" in item.body
      ) {
        env.BUNGIE_API_STATUS?.writeDataPoint(item.body);
        item.ack();
      } else {
        console.log("Ignoring invalid message:", item.body);
      }
    }
  },
} satisfies ExportedHandler<
  BungieApiWebhooksWorkerEnv,
  AnalyticsEngineDataPoint
>;
