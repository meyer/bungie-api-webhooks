import { bungieGetDestinyManifest } from "./bungieApi.js";
import { firestore } from "./firestore.js";

export const updateManifestVersion = async () => {
  const manifest = await bungieGetDestinyManifest();
  const writeResult = await firestore
    .collection("metadata")
    .doc("manifest")
    .set({ version: manifest.version }, { merge: true });

  return {
    manifestVersion: manifest.version,
    versionWasUpdated: !writeResult.isEqual,
  };
};
