import functions from "firebase-functions";

import { bungieGetDestinyManifest } from "../bungieApi.js";
import { firestore } from "../firestore.js";

const updateManifestVersion = async () => {
  const manifest = await bungieGetDestinyManifest();
  await firestore
    .collection("metadata")
    .doc("manifest")
    .set({ version: manifest.version }, { merge: true });
  return manifest.version;
};

export const checkManifest = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  })
  .https.onRequest(async (req, res) => {
    const manifestVersion = await updateManifestVersion();
    res.json({ manifestVersion });
  });

export const checkManifestCron = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
  })
  .pubsub.schedule("*/5 * * * *")
  .onRun(async () => {
    await updateManifestVersion();
  });
