import functions from "firebase-functions";

import { BungieApiError } from "./bungieApi.js";

export const promiseMap = async <
  T extends Record<string, () => Promise<unknown>>
>(
  obj: T
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]> | string> }> => {
  const entries = await Promise.all(
    Object.entries(obj).map(async ([key, fn]) => {
      try {
        return [key, await fn()] as const;
      } catch (error) {
        if (error instanceof BungieApiError) {
          functions.logger.error(
            "Bungie API error: %s %s",
            error.errorCode,
            error.errorStatus
          );
          return [key, error.errorCode + " " + error.errorStatus] as const;
        }
        return [key, error + ""] as const;
      }
    })
  );

  return Object.fromEntries(entries) as any;
};
