import assert from "assert";
import nodeFetch from "node-fetch";
import { format } from "util";

import { bungieGetCommonSettings } from "./bungieApi.js";
import {
  assertIsObject,
  getArrayOf,
  getArticleObject,
  getObject,
} from "./typePredicates.js";

export type ContentStackArticle = Awaited<
  ReturnType<typeof getLatestArticlesFromContentStack>
>[number];

export type ContentStackSettings = Awaited<
  ReturnType<typeof getContentStackSettings>
>;

export const getContentStackSettings = async () => {
  const settings = await bungieGetCommonSettings();

  // ContentStack API key lives here
  const contentstackParams = settings.systems.ContentStack?.parameters;
  assert(
    typeof contentstackParams === "object" && settings.systems.ContentStack,
    "ContentStack params missing"
  );

  // "ApiKey": "xxxxxxxxxxxxxxxxxxxxxx",
  // "EnvPlusDeliveryToken": "{live}{xxxxxxxxxxxxxxxxxxx}"
  const { ApiKey: csApiKey, EnvPlusDeliveryToken: csEnvPlusDeliveryToken } =
    settings.systems.ContentStack.parameters;
  assert(
    typeof csApiKey === "string" && typeof csEnvPlusDeliveryToken === "string",
    "Missing ApiKey or EnvPlusDeliveryToken"
  );

  const envPlusDeliveryTokenRegex = /^{(.+?)}{(.+?)}$/;
  const match = csEnvPlusDeliveryToken.match(envPlusDeliveryTokenRegex);
  assert(
    match,
    "EnvPlusDeliveryToken format has changed: " + csEnvPlusDeliveryToken
  );

  const [, csEnv, csDeliveryToken] = match;
  // these should always be set but TypeScript doesn't speak regex
  assert(csEnv && csDeliveryToken, "envPlusDeliveryTokenRegex error");

  return { csEnv, csDeliveryToken, csApiKey };
};

const runCsGraphQlQuery = async (
  settings: ContentStackSettings,
  query: string,
  variables?: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const csUrl = format(
    "https://graphql.contentstack.com/stacks/%s?environment=%s",
    settings.csApiKey,
    settings.csEnv
  );

  const result = await nodeFetch(csUrl, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      access_token: settings.csDeliveryToken,
    },
    referrer: "https://www.contentstack.com/",
    body: JSON.stringify({
      query,
      variables,
    }),
    method: "POST",
  });

  return getObject(await result.json());
};

export const getLatestArticlesFromContentStack = async (
  settings: ContentStackSettings
) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const articlesResponse = await runCsGraphQlQuery(
    settings,
    `
query ($date: String) {
  articles: all_news_article(where: {date_gt: $date}) {
    items {
      title
      subtitle
      date
      author
      system {
        uid
        publish_details {
          time
        }
      }
      url {
        hosted_url
      }
    }
    total
  }
}
`,
    {
      date: oneWeekAgo.toISOString(),
    }
  );

  assertIsObject(articlesResponse.data);
  assertIsObject(articlesResponse.data.articles);

  const twabRegex = /^This Week At Bungie\b/i;
  const hotfixRegex = /^Destiny 2 Hotfix ([\d+.]+)$/i;
  const updateRegex = /^Destiny 2 Update ([\d+.]+)$/i;

  const articles = getArrayOf(
    articlesResponse.data.articles.items,
    getArticleObject
  );

  return articles.map((item) => {
    const date = new Date(item.date);
    const url = "https://www.bungie.net/7/en/news/article" + item.url;

    // common article fields
    const articleWithDefaults = { ...item, url, type: "news" } as const;

    const dateString = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "PST",
    });

    const twabMatch = item.title.match(twabRegex);
    if (twabMatch) {
      const twabTitle = "TWAB — " + dateString;
      return {
        ...articleWithDefaults,
        type: "twab",
        title: twabTitle,
      } as const;
    }

    const hotfixMatch = item.title.match(hotfixRegex);
    if (hotfixMatch) {
      const hotfixTitle = "Destiny 2 Hotfix " + hotfixMatch[1];
      return {
        ...articleWithDefaults,
        type: "hotfix",
        hotfixNumber: hotfixMatch[1],
        title: hotfixTitle,
      } as const;
    }

    const updateMatch = item.title.match(updateRegex);
    if (updateMatch) {
      const updateTitle = "Destiny 2 Update " + updateMatch[1];
      return {
        ...articleWithDefaults,
        type: "update",
        updateNumber: updateMatch[1],
        title: updateTitle,
      } as const;
    }

    return articleWithDefaults;
  });
};
