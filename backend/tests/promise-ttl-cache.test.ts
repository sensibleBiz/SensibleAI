import assert from "node:assert/strict";
import { test } from "node:test";
import { createPromiseTtlCache } from "../src/utils/promiseTtlCache.js";

test("promise cache deduplicates concurrent loads for the same key", async () => {
  const cache = createPromiseTtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
  let loads = 0;
  const load = async () => {
    loads += 1;
    return 42;
  };

  const [first, second] = await Promise.all([
    cache.get("profile-1", load),
    cache.get("profile-1", load),
  ]);

  assert.equal(first, 42);
  assert.equal(second, 42);
  assert.equal(loads, 1);
});

test("promise cache evicts failed loads so they can be retried", async () => {
  const cache = createPromiseTtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
  let loads = 0;

  await assert.rejects(
    cache.get("profile-1", async () => {
      loads += 1;
      throw new Error("temporary failure");
    }),
  );

  const result = await cache.get("profile-1", async () => {
    loads += 1;
    return 7;
  });

  assert.equal(result, 7);
  assert.equal(loads, 2);
});

test("promise cache can invalidate only matching keys", async () => {
  const cache = createPromiseTtlCache<number>({ maxEntries: 10, ttlMs: 1_000 });
  let firstLoads = 0;
  let secondLoads = 0;
  const loadFirst = async () => ++firstLoads;
  const loadSecond = async () => ++secondLoads;

  await cache.get("outlet-1:first", loadFirst);
  await cache.get("outlet-2:second", loadSecond);
  cache.deleteWhere((key) => key.startsWith("outlet-1:"));
  await cache.get("outlet-1:first", loadFirst);
  await cache.get("outlet-2:second", loadSecond);

  assert.equal(firstLoads, 2);
  assert.equal(secondLoads, 1);
});
