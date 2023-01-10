import { BungieApiError } from "./bungieApi.js";

interface ErrorResult {
  type: "error";
  message: string;
}

interface SuccessResult<T> {
  type: "success";
  content: T;
}

type PromiseMapResult<T> = ErrorResult | SuccessResult<T>;

export const promiseMap = async <
  T extends Record<string, () => Promise<unknown>>
>(
  obj: T
): Promise<{ [K in keyof T]: PromiseMapResult<Awaited<ReturnType<T[K]>>> }> => {
  const entries = await Promise.all(
    Object.entries(obj).map(async ([key, fn]) => {
      try {
        return [key, { status: "success", content: await fn() }] as const;
      } catch (error) {
        if (error instanceof BungieApiError) {
          return [
            key,
            {
              type: "error",
              message:
                "Bungie API Error: " +
                error.errorCode +
                " " +
                error.errorStatus,
            },
          ] as const;
        }
        return [key, { type: "error", message: error + "" }] as const;
      }
    })
  );

  return Object.fromEntries(entries) as any;
};
