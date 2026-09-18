import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";

const requests = [];
let responder = async () => ({ status: 200, body: { recipe_id: "recipe-a", version: 2 } });

globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });
      const response = await responder(url, body);
      return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});

installRuntime();
const {
  clonePrivateRecipe,
  createRetryOperationKeyStore,
  PrivateRecipeMutationError,
  updatePrivateRecipe,
} = await import("../src/lib/hasat/privateRecipeMutations.ts");

const payload = (title) => ({
  title,
  description: null,
  servings: 2,
  prep_minutes: 10,
  cook_minutes: 20,
  rest_minutes: null,
  difficulty: "kolay",
  ingredients: [{ free_text_name: "Domates", quantity: 2, unit: "adet" }],
  steps: [{ instruction: "Pişir.", timer_seconds: 60 }],
});

test("aynı update retry aynı operation key'i ve aynı tekil RPC sonucunu kullanır", async () => {
  requests.length = 0;
  let attempt = 0;
  responder = async () => {
    attempt += 1;
    if (attempt === 1)
      return { status: 503, body: { code: "PGRST000", message: "temporary network failure" } };
    return { status: 200, body: { recipe_id: "recipe-a", version: 2 } };
  };
  const operationKeys = createRetryOperationKeyStore();
  const input = {
    recipeId: "recipe-a",
    expectedVersion: 1,
    payload: payload("Birinci"),
    operationKeys,
  };

  await assert.rejects(() => updatePrivateRecipe(input), PrivateRecipeMutationError);
  const result = await updatePrivateRecipe(input);

  assert.deepEqual(result, { recipeId: "recipe-a", version: 2 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.p_operation_key, requests[1].body.p_operation_key);
  assert.equal(requests[0].body.p_expected_version, 1);
  assert.equal(requests[0].body.p_payload.visibility, undefined);
  assert.equal(requests[0].body.p_payload.status, undefined);
  assert.equal(requests[0].body.p_payload.owner_id, undefined);
});

test("başarıdan sonraki farklı update yeni key ve yeni expected_version kullanır", async () => {
  requests.length = 0;
  responder = async (_url, body) => ({
    status: 200,
    body: { recipe_id: "recipe-a", version: body.p_expected_version + 1 },
  });
  const operationKeys = createRetryOperationKeyStore();
  const first = await updatePrivateRecipe({
    recipeId: "recipe-a",
    expectedVersion: 1,
    payload: payload("Birinci"),
    operationKeys,
  });
  const second = await updatePrivateRecipe({
    recipeId: "recipe-a",
    expectedVersion: first.version,
    payload: payload("İkinci"),
    operationKeys,
  });

  assert.equal(second.version, 3);
  assert.notEqual(requests[0].body.p_operation_key, requests[1].body.p_operation_key);
  assert.deepEqual(requests.map((r) => r.body.p_expected_version), [1, 2]);
});

test("stale version veriyi başarı gibi döndürmez ve aynı mantıksal retry key'ini korur", async () => {
  requests.length = 0;
  responder = async () => ({
    status: 409,
    body: { code: "40001", message: "private_recipe_version_conflict" },
  });
  const operationKeys = createRetryOperationKeyStore();
  const input = {
    recipeId: "recipe-a",
    expectedVersion: 1,
    payload: payload("Yerel taslak"),
    operationKeys,
  };

  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(
      () => updatePrivateRecipe(input),
      (error) =>
        error instanceof PrivateRecipeMutationError &&
        error.code === "version_conflict" &&
        error.message.includes("yeniden yükleyip"),
    );
  }
  assert.equal(requests[0].body.p_operation_key, requests[1].body.p_operation_key);
  assert.equal(input.payload.title, "Yerel taslak");
});

test("clone retry aynı source için dedupe olur; başarı ve farklı source key'i döndürür", async () => {
  requests.length = 0;
  let attempt = 0;
  responder = async (_url, body) => {
    attempt += 1;
    if (attempt === 1)
      return { status: 503, body: { code: "PGRST000", message: "temporary" } };
    return {
      status: 200,
      body: {
        recipe_id: body.p_source_recipe_id === "source-a" ? "clone-a" : "clone-b",
        version: 1,
      },
    };
  };
  const operationKeys = createRetryOperationKeyStore();
  await assert.rejects(() =>
    clonePrivateRecipe({ sourceRecipeId: "source-a", operationKeys }),
  );
  const replay = await clonePrivateRecipe({ sourceRecipeId: "source-a", operationKeys });
  const next = await clonePrivateRecipe({ sourceRecipeId: "source-b", operationKeys });

  assert.equal(replay.recipeId, "clone-a");
  assert.equal(next.recipeId, "clone-b");
  assert.equal(requests[0].body.p_operation_key, requests[1].body.p_operation_key);
  assert.notEqual(requests[1].body.p_operation_key, requests[2].body.p_operation_key);
});

test("iki hızlı aynı clone çağrısı aynı key ile tek tarif sonucuna bağlanır", async () => {
  requests.length = 0;
  responder = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { status: 200, body: { recipe_id: "one-clone", version: 1 } };
  };
  const operationKeys = createRetryOperationKeyStore();
  const [first, second] = await Promise.all([
    clonePrivateRecipe({ sourceRecipeId: "source-a", operationKeys }),
    clonePrivateRecipe({ sourceRecipeId: "source-a", operationKeys }),
  ]);

  assert.equal(first.recipeId, "one-clone");
  assert.equal(second.recipeId, "one-clone");
  assert.equal(requests[0].body.p_operation_key, requests[1].body.p_operation_key);
});

test("idempotency ve authentication hataları güvenli kullanıcı mesajlarına çevrilir", async () => {
  const operationKeys = createRetryOperationKeyStore();
  responder = async () => ({
    status: 400,
    body: { code: "22023", message: "private_recipe_idempotency_conflict secret-payload" },
  });
  await assert.rejects(
    () =>
      updatePrivateRecipe({
        recipeId: "recipe-a",
        expectedVersion: 1,
        payload: payload("x"),
        operationKeys,
      }),
    (error) =>
      error.code === "idempotency_conflict" && !error.message.includes("secret-payload"),
  );

  responder = async () => ({
    status: 403,
    body: { code: "42501", message: "authentication_required internal-detail" },
  });
  await assert.rejects(
    () => clonePrivateRecipe({ sourceRecipeId: "source-a", operationKeys }),
    (error) =>
      error.code === "authentication_required" && !error.message.includes("internal-detail"),
  );
});
