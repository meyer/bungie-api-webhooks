import type {
  BungieApiClient,
  ContentStackArticle,
  ContentStackSettings,
} from "@workers-utils/bungie";
import {
  BungieApiError,
  getBungieApiClient,
  getContentStackSettings,
  getLatestArticlesFromContentStack,
} from "@workers-utils/bungie";
import { JsonResponse } from "@workers-utils/common";

import type { BungieApiWebhooksWorkerEnv } from "../types";

export class ArticleChecker implements DurableObject {
  constructor(
    private state: DurableObjectState,
    env: BungieApiWebhooksWorkerEnv
  ) {
    this.bungieClient = getBungieApiClient({
      apiKey: env.BUNGIE_API_KEY,
      apiOrigin: env.BUNGIE_API_ORIGIN,
      definitions: env.DESTINY_DEFINITIONS,
    });
  }

  private bungieClient: BungieApiClient;
  private csSettings: ContentStackSettings | null = null;

  async fetch(request: Request) {
    try {
      if (!this.csSettings) {
        const settings = await this.bungieClient.getCommonSettings();
        this.csSettings = await getContentStackSettings(settings.Response);
      }

      const articles = await getLatestArticlesFromContentStack(this.csSettings);
      const articleUids = articles.map((article) => article.uid);
      const seenArticles = await this.state.storage.get(articleUids);

      const newArticles: ContentStackArticle[] = [];
      for (const article of articles) {
        if (seenArticles.has(article.uid)) continue;
        newArticles.push(article);
        this.state.storage.put(article.uid, article);
      }

      return new JsonResponse({
        fetchedArticleCount: articles.length,
        newArticleCount: newArticles.length,
        newArticles: newArticles.map((article) => article.title),
      });
    } catch (error) {
      if (error instanceof BungieApiError) {
        return new JsonResponse({
          bungieErrorCode: error.errorCode,
          bungieErrorStatus: error.errorStatus,
        });
      }

      return new JsonResponse({
        error: "" + error,
      });
    }
  }
}
