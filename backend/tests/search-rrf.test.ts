import assert from "node:assert/strict";
import test from "node:test";
import { reciprocalRankFusion, RRF_K } from "../src/modules/search/rrf.js";

test("empty lists produce empty output", () => {
  const result = reciprocalRankFusion(new Set(), []);
  assert.deepEqual(result, []);
});

test("single FTS list returns items in order with decreasing scores", () => {
  const ids = ["a", "b", "c"];
  const result = reciprocalRankFusion(new Set(), [["fts", ids]]);
  assert.equal(result.length, 3);
  assert.equal(result[0]!.id, "a");
  assert.equal(result[1]!.id, "b");
  assert.equal(result[2]!.id, "c");
  assert.ok(result[0]!.score > result[1]!.score);
  assert.ok(result[1]!.score > result[2]!.score);
  assert.deepEqual(result[0]!.matchedBy, ["fts"]);
});

test("exact match boost places exact items above FTS-only items", () => {
  // FTS list ranks "fts-top" first, but "exact-id" is an exact match
  const result = reciprocalRankFusion(
    new Set(["exact-id"]),
    [["fts", ["fts-top", "exact-id", "fts-bottom"]]],
  );
  const byId = Object.fromEntries(result.map((r) => [r.id, r]));

  // exact-id has a base FTS score of 1/(60+2)=~0.0161 plus the +1.0 boost = ~1.0161
  // fts-top has only  1/(60+1)=~0.0164
  assert.ok(byId["exact-id"]!.score > byId["fts-top"]!.score);
  assert.deepEqual(byId["exact-id"]!.matchedBy.sort(), ["exact", "fts"]);
});

test("item appearing in multiple lists gets higher score than item in one list", () => {
  const result = reciprocalRankFusion(new Set(), [
    ["fts", ["shared", "fts-only"]],
    ["vector", ["shared", "vec-only"]],
  ]);
  const byId = Object.fromEntries(result.map((r) => [r.id, r]));
  assert.ok(byId["shared"]!.score > byId["fts-only"]!.score);
  assert.ok(byId["shared"]!.score > byId["vec-only"]!.score);
  assert.ok(byId["shared"]!.matchedBy.includes("fts"));
  assert.ok(byId["shared"]!.matchedBy.includes("vector"));
});

test("exact-only item (not in any ranked list) gets score 1.0", () => {
  const result = reciprocalRankFusion(new Set(["phone-match"]), [
    ["fts", ["unrelated"]],
  ]);
  const phoneMatch = result.find((r) => r.id === "phone-match");
  assert.ok(phoneMatch, "exact-only item should appear in results");
  assert.equal(phoneMatch!.score, 1.0);
  assert.deepEqual(phoneMatch!.matchedBy, ["exact"]);
});

test("custom k=1 changes scores correctly", () => {
  // With k=1: rank 0 → 1/(1+0+1)=0.5, rank 1 → 1/(1+1+1)=0.333
  const result = reciprocalRankFusion(new Set(), [["fts", ["a", "b"]]], 1);
  const a = result.find((r) => r.id === "a")!;
  const b = result.find((r) => r.id === "b")!;
  assert.ok(Math.abs(a.score - 0.5) < 1e-9);
  assert.ok(Math.abs(b.score - 1 / 3) < 1e-9);
});

test("RRF_K default is 60", () => {
  assert.equal(RRF_K, 60);
});
