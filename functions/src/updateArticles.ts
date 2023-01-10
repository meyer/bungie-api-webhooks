import assert from "assert";
import { Timestamp } from "firebase-admin/firestore";
import functions from "firebase-functions";

import type { ContentStackSettings } from "./contentStack.js";
import {
  getContentStackSettings,
  getLatestArticlesFromContentStack,
} from "./contentStack.js";
import { firestore } from "./firestore.js";
import { assertIsObject } from "./typePredicates.js";

export const updateArticles = async () => {
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

  const writeResult = await batch.commit();
  return {
    updatedArticleCount: writeResult.filter((result) => !result.isEqual).length,
  };
};
