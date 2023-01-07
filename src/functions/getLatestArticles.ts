import { PubSub } from "@google-cloud/pubsub";
import * as functions from "firebase-functions";

import { getLatestArticlesFromContentStack } from "../contentStack.js";

// Creates a client; cache this for further use
const pubSubClient = new PubSub();

export const getLatestArticles = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
    // Firebase max is 9 minutes
    timeoutSeconds: 540,
  })
  .https.onRequest(async (req, res) => {
    const news = await getLatestArticlesFromContentStack();

    for (const item of news) {
      // Publishes the message as a string, e.g. "Hello, world!" or JSON.stringify(someObject)
      const dataBuffer = Buffer.from(JSON.stringify(item));

      try {
        const messageId = await pubSubClient
          .topic("news-updates")
          .publishMessage({
            data: dataBuffer,
            attributes: {
              uid: item.uid,
            },
          });
        functions.logger.info(`Message ${messageId} published.`);
      } catch (error) {
        functions.logger.error("Received error while publishing:", error);
      }
    }

    res.json(news);
  });
