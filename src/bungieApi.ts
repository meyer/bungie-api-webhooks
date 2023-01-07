import assert from "assert";
import { getCommonSettings } from "bungie-api-ts/core";
import type { ServerResponse } from "bungie-api-ts/destiny2";
import {
  type HttpClient,
  getDestinyManifest,
  getProfile,
} from "bungie-api-ts/destiny2";
import nodeFetch, { type RequestInit } from "node-fetch";

const bungieHttpClient: HttpClient = async (config) => {
  const { BUNGIE_API_KEY, BUNGIE_API_ORIGIN } = process.env;
  assert(typeof BUNGIE_API_KEY === "string");
  assert(typeof BUNGIE_API_ORIGIN === "string");

  const url = new URL(config.url);
  if (config.params) {
    for (const key in config.params) {
      url.searchParams.set(key, config.params[key]);
    }
  }

  const requestConfig: RequestInit = {
    method: config.method,
    headers: {
      "X-API-Key": BUNGIE_API_KEY,
      Origin: BUNGIE_API_ORIGIN,
    },
  };

  if (config.body) {
    requestConfig.body = config.body;
  }

  const response = await nodeFetch(url.toString(), requestConfig);

  return await response.json();
};

type BungieApiFunction = (
  client: HttpClient,
  ...args: any[]
) => Promise<ServerResponse<unknown>>;

/** Get the second param off a function type */
type Parameters2<T extends (...args: any[]) => unknown> = T extends (
  arg: any,
  ...args: infer P
) => unknown
  ? P
  : never;

const getApiFunction =
  <T extends BungieApiFunction>(getter: T) =>
  async (
    ...args: Parameters2<T>
  ): Promise<Awaited<ReturnType<T>>["Response"]> => {
    const result = await getter(bungieHttpClient, ...args);
    return result.Response;
  };

export const bungieGetDestinyManifest = getApiFunction(getDestinyManifest);
export const bungieGetCommonSettings = getApiFunction(getCommonSettings);
export const bungieGetProfile = getApiFunction(getProfile);
