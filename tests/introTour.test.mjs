import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSeenIntroTourInStorage,
  introTourStorageKey,
  markIntroTourSeenInStorage,
  removeIntroTourSeenFromStorage,
} from "../.test-build/introTourPersistence.js";
import { createIntroTourEvaluator } from "../.test-build/introTourEvaluator.js";

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

test("unseen user returns false and completion marks only that user", async () => {
  const storage = memoryStorage();
  assert.equal(await hasSeenIntroTourInStorage("user-a", storage), false);
  await markIntroTourSeenInStorage("user-a", storage);
  assert.equal(await hasSeenIntroTourInStorage("user-a", storage), true);
  assert.equal(await hasSeenIntroTourInStorage("user-b", storage), false);
});

test("deletion removes only the target user's tour key", async () => {
  const storage = memoryStorage();
  await markIntroTourSeenInStorage("user-a", storage);
  await markIntroTourSeenInStorage("user-b", storage);
  await removeIntroTourSeenFromStorage("user-a", storage);
  assert.equal(await hasSeenIntroTourInStorage("user-a", storage), false);
  assert.equal(await hasSeenIntroTourInStorage("user-b", storage), true);
  assert.equal(storage.values.has("hasat_mobile_intro_done"), false);
});

test("no session followed by auth evaluates the authenticated user", async () => {
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    async () => false,
    (value) => decisions.push(value),
  );
  await evaluator.evaluate(null);
  await evaluator.evaluate("user-a");
  assert.deepEqual(decisions, [
    { userId: null, visible: false },
    { userId: "user-a", visible: true },
  ]);
});

test("switching users re-evaluates independently", async () => {
  const storage = memoryStorage();
  await markIntroTourSeenInStorage("user-a", storage);
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    (userId) => hasSeenIntroTourInStorage(userId, storage),
    (value) => decisions.push(value),
  );
  await evaluator.evaluate("user-a");
  await evaluator.evaluate("user-b");
  assert.deepEqual(decisions, [
    { userId: "user-a", visible: false },
    { userId: "user-b", visible: true },
  ]);
});

test("stale async result from user A cannot affect user B", async () => {
  let resolveA;
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    (userId) =>
      userId === "user-a"
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve(false),
    (value) => decisions.push(value),
  );
  const pendingA = evaluator.evaluate("user-a");
  await evaluator.evaluate("user-b");
  resolveA(true);
  await pendingA;
  assert.deepEqual(decisions, [{ userId: "user-b", visible: true }]);
});

test("same-account reopen remains seen", async () => {
  const storage = memoryStorage();
  await markIntroTourSeenInStorage("user-a", storage);
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    (userId) => hasSeenIntroTourInStorage(userId, storage),
    (value) => decisions.push(value),
  );
  await evaluator.evaluate("user-a");
  await evaluator.evaluate(null);
  await evaluator.evaluate("user-a");
  assert.equal(decisions.at(-1).visible, false);
  assert.equal(storage.values.get(introTourStorageKey("user-a")), "1");
});
