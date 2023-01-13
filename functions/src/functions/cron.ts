import functions from "firebase-functions";

import { bungieTimeZone } from "../constants.js";
import { promiseMap } from "../promiseMap.js";
import { updateApiStatus } from "../updateApiStatus.js";
import { updateArticles } from "../updateArticles.js";
import { updateManifestVersion } from "../updateManifestVersion.js";

export const checkAll = functions
  .runWith({
    // it's ok if this one takes a while
    timeoutSeconds: 60,
  })
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
    // fail quickly since this check runs frequently
    timeoutSeconds: 5,
  })
  .pubsub.schedule(
    // every two minutes
    "*/2 * * * *"
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
