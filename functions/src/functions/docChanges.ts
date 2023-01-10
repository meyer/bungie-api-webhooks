import { PubSub } from "@google-cloud/pubsub";
import assert from "assert";
import { Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";

import type { ContentStackArticle } from "../contentStack.js";
import { firestore } from "../firestore.js";

const pubSubClient = new PubSub();
const webhookPubsubTopic = "dispatched-webhooks";

interface ManifestUpdateEvent {
  oldVersion: string | undefined;
  newVersion: string;
}

interface ArticleUpdateEvent {
  uid: string;
  article: ContentStackArticle;
}

interface ApiStatusEvent {
  oldStatus: boolean;
  newStatus: boolean;
}

interface WebhookThings {
  apiStatus: ApiStatusEvent;
  articleUpdate: ArticleUpdateEvent;
  manifestUpdate: ManifestUpdateEvent;
}

const dispatchWebhookMessagesForEvent = async (
  event: keyof WebhookThings,
  context: functions.EventContext,
  payload: WebhookThings[typeof event]
): Promise<void> => {
  const webhooksCollectionRef = firestore.collection("webhooks");

  const webhookDocs = await webhooksCollectionRef
    .where("events", "array-contains-any", [event])
    .get();

  functions.logger.info(
    "%s webhook matches for event %s",
    webhookDocs.size,
    event
  );

  const webhookDocPromises = webhookDocs.docs.map(async (doc) => {
    const webhookId = doc.id;
    try {
      const messageId = await pubSubClient
        .topic(webhookPubsubTopic)
        .publishMessage({
          json: payload,
          attributes: {
            event,
            webhookId,
            dispatchTimestamp: context.timestamp,
          },
        });
      functions.logger.info(
        "Dispatched message %s for webhook %s (%s)",
        messageId,
        webhookId,
        event
      );
    } catch (error) {
      functions.logger.error(
        "Could not dispatch message for webhook %s (%s)",
        webhookId,
        event
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

    const { event, webhookId, dispatchTimestamp } = message.attributes;
    const payload = message.json;
    assert(
      typeof event === "string",
      "context.params does not contain a valid event"
    );
    assert(
      typeof webhookId === "string",
      "context.params does not contain a valid webhookId"
    );
    assert(
      typeof dispatchTimestamp === "string",
      "context.params does not contain a valid dispatchTimestamp"
    );

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
        event,
        responseTimestamp: Timestamp.fromDate(new Date(context.timestamp)),
        dispatchTimestamp: Timestamp.fromDate(new Date(dispatchTimestamp)),
        payload,
      },
      ...docHistory,
    ].slice(0, 20);

    await docRef.set({ history: updatedHistory }, { merge: true });
  });

export const articleCreate = functions.firestore
  .document("articles/{uid}")
  .onCreate(async (snapshot, context) => {
    const article = snapshot.data() as ContentStackArticle;
    functions.logger.info("Article %s published", context.params.uid, article);
    await dispatchWebhookMessagesForEvent("articleUpdate", context, {
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
          oldStatus: !!beforeData?.isEnabled,
          newStatus: !!afterData.isEnabled,
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
