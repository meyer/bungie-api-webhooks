import functions from "firebase-functions";

import { bungieTimeZone } from "../constants.js";
import { updateArticles } from "../updateArticles.js";

const cronTimesByName = {
  // every fifteen minutes from 9am to 4:45pm on Monday-Friday
  checkWeekday: "*/15 9-16 * * 1-5",
  // every half hour from 9am to 4:30pm on Saturday and Sunday
  checkWeekend: "*/30 9-16 * * 0,6",
  // every hour from 5pm to 8am on every day
  checkNightly: "0 0-8,17-23 * * *",
};

export const articles = Object.fromEntries(
  Object.entries(cronTimesByName).map(([functionName, cronTime]) => {
    return [
      functionName,
      functions
        .runWith({ timeoutSeconds: 60 })
        .pubsub.schedule(cronTime)
        .timeZone(bungieTimeZone)
        .onRun(async () => {
          const checkResult = await updateArticles();
          functions.logger.info(
            "%s articles checked, %s updated",
            checkResult.fetchedArticleCount,
            checkResult.updatedArticleCount
          );
        }),
    ] as const;
  })
);

export const whereTwab = functions.https.onRequest(async (req, res) => {
  try {
    await updateArticles();
    res.send("TWAB check complete");
  } catch (error) {
    res.status(500).send("Something went wrong");
  }
});
