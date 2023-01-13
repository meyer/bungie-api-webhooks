import assert from "assert";
import * as functions from "firebase-functions";

import type { ContentStackArticle } from "../contentStack.js";
import { dispatchWebhookMessagesForEvent } from "../dispatchWebhookMessagesForEvent.js";

export const articleCreate = functions.firestore
  .document("articles/{uid}")
  .onCreate(async (snapshot, context) => {
    const article = snapshot.data() as ContentStackArticle;
    functions.logger.info("Article %s published", context.params.uid, article);

    if (article.type === "twab") {
      await dispatchWebhookMessagesForEvent("twabArticleCreate", context, {
        uid: context.params.uid,
        article,
      });
    } else if (article.type === "hotfix") {
      await dispatchWebhookMessagesForEvent("hotfixArticleCreate", context, {
        uid: context.params.uid,
        article,
      });
    } else if (article.type === "update") {
      await dispatchWebhookMessagesForEvent("updateArticleCreate", context, {
        uid: context.params.uid,
        article,
      });
    } else {
      await dispatchWebhookMessagesForEvent("newsArticleCreate", context, {
        uid: context.params.uid,
        article,
      });
    }
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

    functions.logger.info("Ignoring %s metadata update", key, {
      beforeData,
      afterData,
    });
  });

export const settingsUpdate = functions.firestore
  .document("settings/{key}")
  .onUpdate(async (change, context) => {
    const { key } = context.params;
    functions.logger.info("Settings key %s updated", key);
  });
