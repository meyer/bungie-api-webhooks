import { PlatformErrorCodes } from "bungie-api-ts/core";
import functions from "firebase-functions";

import { BungieApiError, bungieGetCommonSettings } from "../bungieApi.js";
import { firestore } from "../firestore.js";

const interestingSystems = {
  Destiny2: true,
};

const checkSettingsEndpoint = async () => {
  const apiDocRef = firestore.collection("metadata").doc("api");

  const enabledSystems: string[] = [];
  const disabledSystems: string[] = [];

  try {
    const commonSettings = await bungieGetCommonSettings();
    for (const [systemName, { enabled }] of Object.entries(
      commonSettings.systems
    )) {
      if (
        !systemName.startsWith("D2") &&
        !interestingSystems.hasOwnProperty(systemName)
      ) {
        continue;
      }

      if (enabled) {
        enabledSystems.push(systemName);
      } else {
        disabledSystems.push(systemName);
      }
    }
  } catch (error) {
    if (error instanceof BungieApiError) {
      functions.logger.error(
        "Bungie API error: %s (%s)",
        error.errorStatus,
        error.errorCode
      );
      if (error.errorCode === PlatformErrorCodes.SystemDisabled) {
        await apiDocRef.set(
          {
            isEnabled: false,
            lastErrorCode: error.errorCode,
            lastErrorStatus: error.errorStatus,
            enabledSystems: null,
            disabledSystems: null,
          },
          { merge: true }
        );

        return {
          status: "error",
          errorCode: error.errorCode,
          errorStatus: error.errorStatus,
        } as const;
      }
    } else {
      functions.logger.error(error);
    }
  }

  await apiDocRef.set(
    {
      isEnabled: true,
      lastErrorCode: null,
      lastErrorStatus: null,
      enabledSystems,
      disabledSystems,
    },
    { merge: true }
  );

  return { status: "ok", enabledSystems, disabledSystems } as const;
};

export const checkApiStatus = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  })
  .https.onRequest(async (req, res) => {
    res.json(await checkSettingsEndpoint());
  });

export const checkApiStatusCron = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  })
  .pubsub.schedule("*/5 * * * *")
  .onRun(async () => {
    const systemResponse = await checkSettingsEndpoint();
    if (systemResponse.status === "ok") {
      functions.logger.debug("The Bungie API is up");
    } else if (systemResponse.status === "error") {
      functions.logger.debug("The Bungie API is down");
    }
  });
