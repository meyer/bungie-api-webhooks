import { PlatformErrorCodes } from "bungie-api-ts/core";
import functions from "firebase-functions";

import { BungieApiError, bungieGetCommonSettings } from "./bungieApi.js";
import { firestore } from "./firestore.js";

const interestingSystems = {
  Destiny2: true,
};

export const updateApiStatus = async () => {
  let isEnabled = true;
  let lastErrorCode: PlatformErrorCodes | null = null;
  let lastErrorStatus: string | null = null;
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
      lastErrorCode = error.errorCode;
      lastErrorStatus = error.errorStatus;
      isEnabled = error.errorCode === PlatformErrorCodes.SystemDisabled;
    } else {
      functions.logger.error(error);
    }
  }

  const result = {
    isEnabled,
    lastErrorCode,
    lastErrorStatus,
    enabledSystems,
    disabledSystems,
  };

  const writeResult = await firestore
    .collection("metadata")
    .doc("api")
    .set(result, { merge: true });

  return { ...result, statusWasUpdated: !writeResult.isEqual };
};
