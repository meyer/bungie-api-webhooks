import * as functions from "firebase-functions";

export const manifestUpdate = functions.pubsub
  .topic("manifest-updates")
  .onPublish((message, context) => {
    functions.logger.info("manifest updated!", {
      data: message.json,
      attributes: message.attributes,
      messageId: context.eventId,
      timestamp: context.timestamp,
    });
    return true;
  });

export const newsUpdate = functions.pubsub
  .topic("news-updates")
  .onPublish((message, context) => {
    functions.logger.info(
      "news updated! %s — %s",
      message.json.title,
      message.json.date,
      {
        data: message.json,
        attributes: message.attributes,
        messageId: context.eventId,
        timestamp: context.timestamp,
      }
    );
    return true;
  });
