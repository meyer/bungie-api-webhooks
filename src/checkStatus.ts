import type { BungieApiWebhooksWorkerEnv } from "./types";

const getJsonFromResponse = async (res: Response) => await res.json();

export const checkStatus = async (
  env: BungieApiWebhooksWorkerEnv,
  body: Record<string, unknown>
) => {
  const apiStatusId = env.API_STATUS_CHECKER_DO.idFromName("apiStatus");
  const articleId = env.ARTICLE_CHECKER_DO.idFromName("article");
  const manifestId = env.MANIFEST_CHECKER_DO.idFromName("manifest");

  const apiStatusStub = env.API_STATUS_CHECKER_DO.get(apiStatusId);
  const articleStub = env.ARTICLE_CHECKER_DO.get(articleId);
  const manifestStub = env.MANIFEST_CHECKER_DO.get(manifestId);

  const init: Parameters<Fetcher["fetch"]>[1] = {
    body: JSON.stringify(body),
    method: "POST",
  };

  const [apiStatus, articleStatus, manifestStatus] = await Promise.all([
    apiStatusStub.fetch("https://api-status", init).then(getJsonFromResponse),
    articleStub.fetch("https://articles", init).then(getJsonFromResponse),
    manifestStub.fetch("https://manifest", init).then(getJsonFromResponse),
  ]);

  console.log("API status:", apiStatus);
  console.log("Article status:", articleStatus);
  console.log("Manifest status:", manifestStatus);

  return { apiStatus, articleStatus, manifestStatus };
};
