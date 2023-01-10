import assert from "assert";
import type { RESTPostAPIWebhookWithTokenJSONBody } from "discord-api-types/v10";
import { Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import nodeFetch from "node-fetch";
import { format } from "util";

import type {
  WebhookMessageAttributes,
  WebhookMessageJson,
} from "../dispatchWebhookMessagesForEvent.js";
import { webhookPubsubTopic } from "../dispatchWebhookMessagesForEvent.js";
import { firestore } from "../firestore.js";
import { getDiscordTimestamp } from "../getDiscordTImestamp.js";

export const webhookMessagePublished = functions.pubsub
  .topic(webhookPubsubTopic)
  .onPublish(async (message, context) => {
    functions.logger.info(
      "Webhook message %s published at ",
      context.eventId,
      context.timestamp,
      {
        data: message.json,
        attributes: message.attributes,
      }
    );

    const messageJson: WebhookMessageJson = message.json;
    const messageAttributes: WebhookMessageAttributes =
      message.attributes as any;

    const {
      event,
      url,
      eventName,
      headers,
      format: webhookFormat,
    } = messageJson;
    const { webhookId, dispatchTimestamp } = messageAttributes;

    let payload: unknown = event;
    if (webhookFormat === "discord" || webhookFormat === "discordForum") {
      const discordPayload: RESTPostAPIWebhookWithTokenJSONBody = {};
      if (eventName === "apiStatus") {
        discordPayload.username = "Bungie API status";
        discordPayload.content =
          "The API is now " + (event.isEnabled ? "enabled" : "disabled") + ".";
      } else if (
        eventName === "twabArticleCreate" ||
        eventName === "newsArticleCreate" ||
        eventName === "updateArticleCreate" ||
        eventName === "hotfixArticleCreate"
      ) {
        const articleDate = new Date(event.article.date);

        discordPayload.username = event.article.author;
        if (webhookFormat === "discordForum") {
          discordPayload.thread_name = event.article.title;
        }
        discordPayload.content = format(
          `%s

%s

_posted %s (%s)_
_ _`,
          event.article.subtitle,
          event.article.url,
          getDiscordTimestamp(articleDate, "shortDateTime"),
          getDiscordTimestamp(articleDate, "relative")
        );
      } else if (eventName === "manifestUpdate") {
        discordPayload.username = "Bungie API manifest update";
        discordPayload.content = format(
          "Manifest version has changed from `%s` to `%s`",
          event.oldVersion,
          event.newVersion
        );
      } else {
        throw new Error("Unhandled event name: " + eventName);
      }
      payload = discordPayload;
    }

    let errorText: string | undefined;
    try {
      const webhookRequest = await nodeFetch(url, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (webhookRequest.status < 200 || webhookRequest.status > 299) {
        const errorResponseText = await webhookRequest.text();
        throw new Error(
          webhookRequest.status +
            ": " +
            webhookRequest.statusText +
            " -- " +
            errorResponseText.slice(0, 200)
        );
      }
    } catch (error) {
      functions.logger.error("Could not call webhook %s: %o", webhookId, error);
      errorText = error instanceof Error ? error.message : error + "";
    }

    const docRef = firestore.collection("webhooks").doc(webhookId);
    const docSnapshot = await docRef.get();
    const docData = docSnapshot.data();

    assert(docData, "Webhook document " + webhookId + " does not exist");

    let docHistory: unknown[];
    if (docData.history) {
      if (!Array.isArray(docData.history)) {
        functions.logger.error(
          "Existing history field in webhook doc %s is not an array",
          webhookId
        );
        docHistory = [];
      } else {
        docHistory = docData.history;
      }
    } else {
      docHistory = [];
    }

    const updatedHistory = [
      {
        eventName,
        status: errorText ? "error" : "success",
        errorText,
        responseTimestamp: Timestamp.fromDate(new Date(context.timestamp)),
        dispatchTimestamp: Timestamp.fromDate(new Date(dispatchTimestamp)),
        payload,
      },
      ...docHistory,
    ].slice(0, 20);

    await docRef.set({ history: updatedHistory }, { merge: true });

    if (errorText) {
      throw new Error("Could not call webhook " + webhookId + ": " + errorText);
    }
  });
