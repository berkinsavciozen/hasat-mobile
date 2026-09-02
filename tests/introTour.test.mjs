import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSeenIntroTourInStorage,
  introTourStorageKey,
  markIntroTourSeenInStorage,
  removeIntroTourSeenFromStorage,
} from "../.test-build/introTourPersistence.js";
import { createIntroTourEvaluator } from "../.test-build/introTourEvaluator.js";
import { deleteAccountWithIntroCleanup } from "../.test-build/deleteAccount.js";

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
  await evaluator.evaluate({ userId: null, role: null });
  await evaluator.evaluate({ userId: "user-a", role: "buyer" });
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
  await evaluator.evaluate({ userId: "user-a", role: "buyer" });
  await evaluator.evaluate({ userId: "user-b", role: "buyer" });
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
  const pendingA = evaluator.evaluate({ userId: "user-a", role: "buyer" });
  await evaluator.evaluate({ userId: "user-b", role: "buyer" });
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
  await evaluator.evaluate({ userId: "user-a", role: "buyer" });
  await evaluator.evaluate({ userId: null, role: null });
  await evaluator.evaluate({ userId: "user-a", role: "buyer" });
  assert.equal(decisions.at(-1).visible, false);
  assert.equal(storage.values.get(introTourStorageKey("user-a")), "1");
});

test("buyer role gates visibility and farmer or unresolved role suppresses it", async () => {
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    async () => false,
    (value) => decisions.push(value),
  );
  await evaluator.evaluate({ userId: "buyer-new", role: "buyer" });
  await evaluator.evaluate({ userId: "farmer", role: "farmer" });
  await evaluator.evaluate({ userId: "unknown", role: null });
  assert.deepEqual(decisions, [
    { userId: "buyer-new", visible: true },
    { userId: null, visible: false },
    { userId: null, visible: false },
  ]);
});

test("authenticated seen buyer remains hidden", async () => {
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    async () => true,
    (value) => decisions.push(value),
  );
  await evaluator.evaluate({ userId: "buyer-seen", role: "buyer" });
  assert.deepEqual(decisions, [{ userId: "buyer-seen", visible: false }]);
});

test("role change invalidates a pending buyer read", async () => {
  let resolveBuyer;
  const decisions = [];
  const evaluator = createIntroTourEvaluator(
    () =>
      new Promise((resolve) => {
        resolveBuyer = resolve;
      }),
    (value) => decisions.push(value),
  );
  const pending = evaluator.evaluate({ userId: "buyer-a", role: "buyer" });
  await evaluator.evaluate({ userId: "buyer-a", role: "farmer" });
  resolveBuyer(false);
  await pending;
  assert.deepEqual(decisions, [{ userId: null, visible: false }]);
});

test("session lookup failure does not block the deletion RPC", async () => {
  let calls = 0;
  await deleteAccountWithIntroCleanup({
    getUserId: async () => {
      throw new Error("session unavailable");
    },
    deleteAccount: async () => {
      calls += 1;
    },
    removeIntroTourSeen: async () => assert.fail("cleanup must not run"),
  });
  assert.equal(calls, 1);
});

test("RPC failure propagates and does not run cleanup", async () => {
  let cleanupCalls = 0;
  await assert.rejects(
    deleteAccountWithIntroCleanup({
      getUserId: async () => "buyer-a",
      deleteAccount: async () => {
        throw new Error("rpc failed");
      },
      removeIntroTourSeen: async () => {
        cleanupCalls += 1;
      },
    }),
    /rpc failed/,
  );
  assert.equal(cleanupCalls, 0);
});

test("successful deletion cleans only the captured user", async () => {
  const storage = memoryStorage();
  await markIntroTourSeenInStorage("buyer-a", storage);
  await markIntroTourSeenInStorage("buyer-b", storage);
  await deleteAccountWithIntroCleanup({
    getUserId: async () => "buyer-a",
    deleteAccount: async () => {},
    removeIntroTourSeen: (userId) =>
      removeIntroTourSeenFromStorage(userId, storage),
  });
  assert.equal(await hasSeenIntroTourInStorage("buyer-a", storage), false);
  assert.equal(await hasSeenIntroTourInStorage("buyer-b", storage), true);
});

test("cleanup failure does not convert successful deletion into failure", async () => {
  await deleteAccountWithIntroCleanup({
    getUserId: async () => "buyer-a",
    deleteAccount: async () => {},
    removeIntroTourSeen: async () => {
      throw new Error("storage failed");
    },
  });
});
