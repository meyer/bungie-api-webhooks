import { getCommonSettings } from "bungie-api-ts/core";
import {
  type HttpClient,
  type ServerResponse,
  getDestinyManifest,
  PlatformErrorCodes,
} from "bungie-api-ts/destiny2";
import nodeFetch, { type RequestInit } from "node-fetch";

import { bungieApiKey, bungieApiOrigin } from "./env.js";

export class BungieApiError extends Error {
  constructor(
    public errorCode: PlatformErrorCodes,
    public errorStatus: string,
    public apiResponse: ServerResponse<unknown>
  ) {
    super(errorCode + ": " + errorStatus);
  }
}

const bungieHttpClient: HttpClient = async (config) => {
  const url = new URL(config.url);
  if (config.params) {
    for (const key in config.params) {
      url.searchParams.set(key, config.params[key]);
    }
  }

  const requestConfig: RequestInit = {
    method: config.method,
    headers: {
      "X-API-Key": bungieApiKey.value(),
      Origin: bungieApiOrigin.value(),
    },
  };

  if (config.body) {
    requestConfig.body = config.body;
  }

  const response = await nodeFetch(url.toString(), requestConfig);

  const jsonResponse = (await response.json()) as ServerResponse<unknown>;

  if (
    typeof jsonResponse === "object" &&
    jsonResponse &&
    "ErrorCode" in jsonResponse &&
    "ErrorStatus" in jsonResponse &&
    jsonResponse.ErrorCode === PlatformErrorCodes.SystemDisabled
  ) {
    throw new BungieApiError(
      jsonResponse.ErrorCode,
      jsonResponse.ErrorStatus,
      jsonResponse
    );
  }

  return jsonResponse;
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
