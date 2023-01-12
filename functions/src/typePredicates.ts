import assert from "assert";

export function assertIsObject(
  item: unknown
): asserts item is Record<string, unknown> {
  assert(typeof item === "object" && item != null);
}

export function getObject(item: unknown): Record<string, unknown> {
  assertIsObject(item);
  return item;
}

export function getArrayOf<T>(
  items: unknown,
  predicate: (item: unknown) => T
): T[] {
  assert(Array.isArray(items));
  return items.map(predicate);
}

export function getArticleObject(item: unknown) {
  assertIsObject(item);
  assert(typeof item.subtitle === "string");
  assert(typeof item.author === "string");
  assert(typeof item.date === "string");
  assert(typeof item.title === "string");

  assertIsObject(item.system);
  assert("uid" in item.system && typeof item.system.uid === "string");
  assert("publish_details" in item.system);
  assertIsObject(item.system.publish_details);
  assert(
    "time" in item.system.publish_details &&
      typeof item.system.publish_details.time === "string"
  );

  assertIsObject(item.url);
  assert("hosted_url" in item.url && typeof item.url.hosted_url === "string");

  return {
    title: item.title.trim(),
    subtitle: item.subtitle.trim(),
    url: item.url.hosted_url.trim(),
    author: item.author.trim(),
    date: item.date.trim(),
    publishDate: item.system.publish_details.time.trim(),
    uid: item.system.uid.trim(),
  };
}
