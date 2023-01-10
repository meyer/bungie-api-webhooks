import { PubSub } from "@google-cloud/pubsub";
import assert from "assert";
import functions from "firebase-functions";

import type { ContentStackArticle } from "./contentStack.js";
import { firestore } from "./firestore.js";
import { assertIsObject } from "./typePredicates.js";

const pubSubClient = new PubSub();
export const webhookPubsubTopic = "dispatched-webhooks";

interface ManifestUpdateEvent {
  oldVersion: string | undefined;
  newVersion: string;
}

interface ApiStatusEvent {
  isEnabled: boolean;
}

type WebhookEventsByName = {
  apiStatus: ApiStatusEvent;
  manifestUpdate: ManifestUpdateEvent;
} & {
  [K in ContentStackArticle["type"] as `${K}ArticleCreate`]: {
    uid: string;
    article: Extract<ContentStackArticle, { type: K }>;
  };
};

type WebhookEvent = {
  [K in keyof WebhookEventsByName]: {
    eventName: K;
    event: WebhookEventsByName[K];
  };
}[keyof WebhookEventsByName];

export type WebhookMessageJson = {
  url: string;
  headers: Record<string, unknown> | undefined;
  format?: string;
} & WebhookEvent;

export interface WebhookMessageAttributes {
  [key: string]: string;
  webhookId: string;
  dispatchTimestamp: string;
}

export const dispatchWebhookMessagesForEvent = async <
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
