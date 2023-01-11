import functions from "firebase-functions";

import { promiseMap } from "../promiseMap.js";
import { updateApiStatus } from "../updateApiStatus.js";
import { updateArticles } from "../updateArticles.js";
import { updateManifestVersion } from "../updateManifestVersion.js";

const runtimeOptions: functions.RuntimeOptions = {
  secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  // Firebase max is 9 minutes
  timeoutSeconds: 60,
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
    "2-59/5 * * * *"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    const { apiResult, manifestResult } = await promiseMap({
      apiResult: updateApiStatus,
      manifestResult: updateManifestVersion,
    });

    if (apiResult.type === "error") {
      functions.logger.error("API status error: %s", apiResult.message);
    } else {
      const status = apiResult.content.isEnabled ? "enabled" : "disabled";
      const didChange = apiResult.content.statusWasUpdated
        ? "updated"
        : "unchanged";

      functions.logger.info(
        "API status: %s (%s)",
        status,
        didChange,
        apiResult.content
      );
    }

    if (manifestResult.type === "error") {
      functions.logger.error(
        "Manifest version error: %s",
        manifestResult.message
      );
    } else {
      const didChange = manifestResult.content.versionWasUpdated
        ? "updated"
        : "unchanged";

      functions.logger.info(
        "Manifest version: %s (%s)",
        manifestResult.content.manifestVersion,
        didChange,
        manifestResult.content
      );
    }
  });

export const checkArticlesWeekday = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every fifteen minutes from 9am to 5pm on Monday-Friday
    "2-59/15 9-17 * * 1-5"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });

export const checkArticlesWeekend = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every hour at minute 2 and 32 from 9am to 5pm on Saturday and Sunday
    "2,32 9-17 * * 0,6"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });

export const checkArticlesNightly = functions
  .runWith(runtimeOptions)
  .pubsub.schedule(
    // every hour at :02 from 5pm to 9am on every day
    "2 0-9,17-23 * * *"
  )
  .timeZone(bungieTimeZone)
  .onRun(async () => {
    await updateArticles();
  });
