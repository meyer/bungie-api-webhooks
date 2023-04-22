export interface BungieApiWebhooksWorkerEnv {
  BUNGIE_API_KEY: string;
  BUNGIE_API_ORIGIN: string;

  API_STATUS_QUEUE: Queue<AnalyticsEngineDataPoint>;

  DESTINY_DEFINITIONS: KVNamespace;

  BUNGIE_API_STATUS: AnalyticsEngineDataset | undefined;
  BUNGIE_MANIFEST_STATUS: AnalyticsEngineDataset | undefined;

  API_STATUS_CHECKER_DO: DurableObjectNamespace;
  ARTICLE_CHECKER_DO: DurableObjectNamespace;
  MANIFEST_CHECKER_DO: DurableObjectNamespace;
}
