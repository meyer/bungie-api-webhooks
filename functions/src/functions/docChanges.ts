import { PubSub } from "@google-cloud/pubsub";
import * as functions from "firebase-functions";

const pubSubClient = new PubSub();

export const articleCreate = functions.firestore
  .document("articles/{uid}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const messageId = await pubSubClient.topic("news-updates").publishMessage({
      data: dataBuffer,
      attributes: {
        uid: context.params.uid,
      },
    });
    functions.logger.info(
      "Published message %s for article %s",
      messageId,
      context.params.uid
    );

    return null;
  });

export const manifestUpdate = functions.firestore
  .document("metadata/{key}")
  .onUpdate(({ before, after }, context) => {
    const { key } = context.params;
    const beforeData = before.data();
    const afterData = after.data();

    console.log({
      key,
      beforeData,
      afterData,
      afterUpdated: after.updateTime.toDate(),
    });

    if (key === "manifest") {
      functions.logger.info("Manifest updated! %s", afterData.version);
    } else {
      functions.logger.error("Unhandled metadata key: %s", key);
    }

    return null;
  });

export const settingsUpdate = functions.firestore
  .document("settings/{key}")
  .onUpdate((change, context) => {
    const { key } = context.params;
    functions.logger.info("Settings for `%s` updated", key);
    return null;
  });
