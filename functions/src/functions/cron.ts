import functions from "firebase-functions";

import { promiseMap } from "../promiseMap.js";
import { updateApiStatus } from "../updateApiStatus.js";
import { updateArticles } from "../updateArticles.js";
import { updateManifestVersion } from "../updateManifestVersion.js";

const runtimeOptions: functions.RuntimeOptions = {
  secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  // Firebase max is 9 minutes
  timeoutSeconds: 540,
};

// Bungie Time TM
const bungieTimeZone = "America/Los_Angeles";

export const checkAll = functions
  .runWith(runtimeOptions)
  .https.onRequest(async (req, res) => {
    const result = await promiseMap({
      apiStatus: updateApiStatus,
      manifestVersion: updateManifestVersion,
      articles: updateArticles,
    });
    res.json(result);
  });

export const checkBungie = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  })
  .pubsub.schedule(
    // every five minutes
    "*/5 * * * *"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    const result = await promiseMap({
      apiStatus: updateApiStatus,
      manifestVersion: updateManifestVersion,
    });
    functions.logger.info("Bungie cron result:", result);
  });

export const checkArticlesThursday = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every five minutes from 9am to 5pm on Thursday
    "*/5 9-17 * * 4"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });

export const checkArticlesDaily = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every 30 minutes from 9am to 5pm on every day that isn't Thursday
    "*/30 9-17 * * 0-5,6"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });

export const checkArticlesNightly = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every hour on the hour from 5pm to 9am on every day
    "0 0-9,17-23 * * *"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });
