import { PubSub } from "@google-cloud/pubsub";
import assert from "assert";
import type { RESTPostAPIWebhookWithTokenJSONBody } from "discord-api-types/v10";
import { Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import nodeFetch from "node-fetch";
import { format } from "util";

import type { ContentStackArticle } from "../contentStack.js";
import { firestore } from "../firestore.js";
import { getDiscordTimestamp } from "../getDiscordTImestamp.js";
import { assertIsObject } from "../typePredicates.js";

const pubSubClient = new PubSub();
const webhookPubsubTopic = "dispatched-webhooks";

interface ManifestUpdateEvent {
  oldVersion: string | undefined;
  newVersion: string;
}

interface ArticleCreateEvent {
  uid: string;
  article: ContentStackArticle;
}

interface ApiStatusEvent {
  isEnabled: boolean;
}

interface WebhookEventsByName {
  apiStatus: ApiStatusEvent;
  articleCreate: ArticleCreateEvent;
  manifestUpdate: ManifestUpdateEvent;
}

type WebhookEvent = {
  [K in keyof WebhookEventsByName]: {
    eventName: K;
    event: WebhookEventsByName[K];
  };
}[keyof WebhookEventsByName];

type WebhookMessageJson = {
  url: string;
  headers: Record<string, unknown> | undefined;
  format?: string;
} & WebhookEvent;

interface WebhookMessageAttributes {
  [key: string]: string;
  webhookId: string;
  dispatchTimestamp: string;
}

const dispatchWebhookMessagesForEvent = async <
  T extends keyof WebhookEventsByName
>(
  eventName: T,
  context: functions.EventContext,
  event: WebhookEventsByName[T]
): Promise<void> => {
  const webhooksCollectionRef = firestore.collection("webhooks");

  const webhookDocs = await webhooksCollectionRef
    .where("events", "array-contains-any", [eventName])
    .get();

  functions.logger.info(
    "%s webhook matches for event %s",
    webhookDocs.size,
    eventName
  );

  const webhookDocPromises = webhookDocs.docs.map(async (doc) => {
    const webhookId = doc.id;

    const docData = doc.data() as Record<string, unknown>;

    const {
      format: webhookFormat,
      url: webhookUrl,
      headers: webhookHeaders,
    } = docData;
    assert(typeof webhookUrl === "string", "webhookUrl is not a string");

    let headers: Record<string, unknown> | undefined;
    if (webhookHeaders) {
      assertIsObject(webhookHeaders);
      headers = webhookHeaders;
    }

    let format: string | undefined;
    if (webhookFormat) {
      assert(typeof webhookFormat === "string");
      format = webhookFormat;
    }

    try {
      // @ts-expect-error unnarrowed union
      const messageJson: WebhookMessageJson = {
        event,
        url: webhookUrl,
        eventName,
        headers,
        format,
      };

      const messageAttributes: WebhookMessageAttributes = {
        webhookId,
        dispatchTimestamp: context.timestamp,
      };

      const messageId = await pubSubClient
        .topic(webhookPubsubTopic)
        .publishMessage({
          json: messageJson,
          attributes: messageAttributes,
        });
      functions.logger.info(
        "Dispatched message %s for webhook %s (%s)",
        messageId,
        webhookId,
        eventName
      );
    } catch (error) {
      functions.logger.error(
        "Could not dispatch message for webhook %s (%s)",
        webhookId,
        eventName,
        error
      );
    }
  });

  await Promise.all(webhookDocPromises);
};

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
      } else if (eventName === "articleCreate") {
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

export const articleCreate = functions.firestore
  .document("articles/{uid}")
  .onCreate(async (snapshot, context) => {
    const article = snapshot.data() as ContentStackArticle;
    functions.logger.info("Article %s published", context.params.uid, article);
    await dispatchWebhookMessagesForEvent("articleCreate", context, {
      uid: context.params.uid,
      article,
    });
  });

export const metadataUpdate = functions.firestore
  .document("metadata/{key}")
  .onUpdate(async ({ before, after }, context) => {
    const { key } = context.params;
    const beforeData = before.data() as Record<string, unknown> | undefined;
    const afterData = after.data() as Record<string, unknown> | undefined;

    functions.logger.log("Metadata update: %s", key, {
      beforeData,
      afterData,
      beforeUpdated: before.updateTime.toDate(),
      afterUpdated: after.updateTime.toDate(),
    });

    if (!afterData) {
      functions.logger.warn("Metadata document %s was deleted", key);
      return;
    }

    if (key === "manifest") {
      if (!beforeData || beforeData.version !== afterData.version) {
        functions.logger.info("Manifest version updated!");

        let oldVersion: string | undefined;
        if (beforeData?.version) {
          assert(
            typeof beforeData.version === "string",
            "beforeData.version is not a string"
          );
          oldVersion = beforeData.version;
        }
        assert(
          typeof afterData.version === "string",
          "afterData.version is not a string"
        );

        functions.logger.info("Previous version: %s", beforeData?.version);
        functions.logger.info("Current version: %s", afterData.version);
        await dispatchWebhookMessagesForEvent("manifestUpdate", context, {
          oldVersion,
          newVersion: afterData.version,
        });
        return;
      }
    } else if (key === "api") {
      if (!beforeData || beforeData.isEnabled !== afterData.isEnabled) {
        functions.logger.info("API status updated!");
        functions.logger.info("Previously enabled: %s", beforeData?.isEnabled);
        functions.logger.info("Currently enabled: %s", afterData.isEnabled);
        await dispatchWebhookMessagesForEvent("apiStatus", context, {
          isEnabled: !!afterData.isEnabled,
        });
        return;
      }
    } else {
      functions.logger.error("Unhandled metadata key: %s", key);
      return;
    }

    functions.logger.info("Ignoring %s metadata update", key);
  });

export const settingsUpdate = functions.firestore
  .document("settings/{key}")
  .onUpdate(async (change, context) => {
    const { key } = context.params;
    functions.logger.info("Settings key %s updated", key);
  });
