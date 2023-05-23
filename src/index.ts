import { JsonResponse } from "@workers-utils/common";
import { getDiscordApiClient } from "@workers-utils/discord";

import { checkStatus } from "./checkStatus";
import type { BungieApiWebhooksWorkerEnv } from "./types";

export { ApiStatusChecker } from "./durable-objects/ApiStatusChecker";
export { ArticleChecker } from "./durable-objects/ArticleChecker";
export { ManifestChecker } from "./durable-objects/ManifestChecker";

export default {
  async fetch(request, env) {
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

    return new Response("no", { status: 404 });
  },

  async scheduled(controller, env) {
    await checkStatus(env, {
      method: "scheduled",
      cron: controller.cron,
      scheduledTime: controller.scheduledTime,
    });
  },

  async queue(batch, env) {
    if (batch.queue === "bungie-api-status-analytics") {
      if (env.BUNGIE_API_STATUS) {
        for (const item of batch.messages) {
          env.BUNGIE_API_STATUS.writeDataPoint(item.body);
          item.ack();
        }
      }
    } else if (batch.queue === "discord-message") {
      const discordClient = getDiscordApiClient({
        applicationId: env.DISCORD_APPLICATION_ID,
        botToken: env.DISCORD_BOT_TOKEN,
      });

      for (const item of batch.messages) {
        try {
          await discordClient.postChannelMessages(
            [env.DISCORD_ERROR_CHANNEL],
            item.body
          );
          item.retry();
        } catch (error) {
          console.error(`Error with item ${item.id}`, item.timestamp, error);
          item.retry();
        }
      }
    } else {
      console.error("Unhandled queue: " + batch.queue);
    }
  },
} satisfies ExportedHandler<BungieApiWebhooksWorkerEnv, any>;
