import assert from "node:assert/strict";
import { test } from "node:test";

const { stripUndefinedForFirestore } = (await import(
  new URL("./firestore-sanitize.ts", import.meta.url).href
)) as typeof import("./firestore-sanitize");

test("stripUndefinedForFirestore removes undefined object fields recursively", () => {
  assert.deepEqual(
    stripUndefinedForFirestore({
      keep: "value",
      remove: undefined,
      nested: {
        keepNull: null,
        removeNested: undefined,
      },
      array: ["a", undefined, { keep: true, remove: undefined }],
    }),
    {
      keep: "value",
      nested: {
        keepNull: null,
      },
      array: ["a", { keep: true }],
    },
  );
});

test("stripUndefinedForFirestore preserves non-plain objects", () => {
  const date = new Date("2026-04-29T12:00:00.000Z");
  assert.equal(stripUndefinedForFirestore(date), date);
});
