import assert from "assert";
import { Timestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";

import type { ContentStackSettings } from "../contentStack.js";
import {
  getContentStackSettings,
  getLatestArticlesFromContentStack,
} from "../contentStack.js";
import { firestore } from "../firestore.js";
import { assertIsObject } from "../typePredicates.js";

export const getLatestArticles = functions
  .runWith({
    secrets: ["BUNGIE_API_KEY", "BUNGIE_API_ORIGIN"],
    // Firebase max is 9 minutes
    timeoutSeconds: 540,
  })
  .https.onRequest(async (req, res) => {
    let csSettings: ContentStackSettings;

    const csSettingsDoc = await firestore
      .collection("settings")
      .doc("contentstack");

    try {
      csSettings = await getContentStackSettings();
    } catch (error) {
      functions.logger.error("Could not fetch ContentStack settings", error);
      try {
        const csSettingsSnapshot = await csSettingsDoc.get();
        const docData = csSettingsSnapshot.data();
        assert(docData, "Cached settings could not be fetched");
        assertIsObject(docData);
        const { csEnv, csDeliveryToken, csApiKey } = docData;
        assert(typeof csEnv === "string");
        assert(typeof csDeliveryToken === "string");
        assert(typeof csApiKey === "string");
        csSettings = { csEnv, csDeliveryToken, csApiKey };
      } catch (error) {
        functions.logger.error(
          "Could not fetch ContentStack settings from Firestore: %o",
          error
        );
        throw new Error("Could not fetch ContentStack settings from Firestore");
      }
    }

    const articles = await getLatestArticlesFromContentStack(csSettings);
    const articleCollection = firestore.collection("articles");
    const batch = firestore.batch();
    for (const article of articles) {
      const articleRef = articleCollection.doc(article.uid);
      batch.set(articleRef, {
        ...article,
        dateTimestamp: Timestamp.fromDate(new Date(article.date)),
      });
    }
    batch.set(csSettingsDoc, csSettings);
    await batch.commit();

    res.json({
      status: 200,
    });
  });
