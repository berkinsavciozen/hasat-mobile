// T6-mobil — idempotency_key Faz A (propose) ve Faz B (save) arasında AYNI
// kalmalı (kabul kriteri #2) ve önerinin doğrulama-başarısız (422) yanıtı da
// hâlâ düzenlenebilir bir taslak olarak dönmeli (dispatch: propose'un canlı
// davranışı — bkz. customize-recipe/index.ts handlePropose, valid?200:422).
import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";

const requests = [];
let proposeStatus = 200;
let proposeBody = null;
let rpcResponse = { data: "new-recipe-id", error: null };

globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });

      if (url.pathname.endsWith("/functions/v1/customize-recipe")) {
        return new Response(JSON.stringify(proposeBody), {
          status: proposeStatus,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.endsWith("/rest/v1/rpc/rpc_create_ai_customized_recipe")) {
        if (rpcResponse.error) {
          return new Response(JSON.stringify({ message: rpcResponse.error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify(rpcResponse.data), {
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`beklenmeyen istek: ${url.pathname}`);
    },
  },
});

installRuntime();
const {
  proposeCustomization,
  saveCustomization,
  newIdempotencyKey,
  CustomizeRecipeError,
} = await import("../src/lib/hasat/customizeRecipe.ts");

test("newIdempotencyKey art arda çağrılarda farklı değer üretir", () => {
  const a = newIdempotencyKey();
  const b = newIdempotencyKey();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test("propose isteği idempotency_key'i gövdede taşır ve geçerli öneriyi döndürür", async () => {
  requests.length = 0;
  proposeStatus = 200;
  proposeBody = {
    idempotency_key: "key-1",
    source_recipe_id: "recipe-1",
    draft: {
      title: "Etsiz Karnıyarık",
      description: null,
      servings: 4,
      prepMinutes: 20,
      cookMinutes: 40,
      restMinutes: null,
      difficulty: "orta",
      ingredients: [
        { crop: "patlican", freeTextName: "Patlıcan", quantity: 4, unit: "adet", note: null, isKeyIngredient: true, sortOrder: 0 },
      ],
      steps: [{ stepNo: 1, instruction: "Patlıcanları közle.", timerSeconds: null }],
    },
    changedFields: ["title"],
    validation: { valid: true, issues: [] },
  };

  const result = await proposeCustomization({
    sourceRecipeId: "recipe-1",
    instruction: "Eti çıkar",
    idempotencyKey: "key-1",
  });

  const call = requests.find((r) => r.url.pathname.endsWith("/functions/v1/customize-recipe"));
  assert.equal(call.body.phase, "propose");
  assert.equal(call.body.idempotency_key, "key-1");
  assert.equal(call.body.source_recipe_id, "recipe-1");
  assert.equal(result.valid, true);
  assert.equal(result.draft.title, "Etsiz Karnıyarık");
  assert.equal(result.draft.ingredients[0].freeTextName, "Patlıcan");
});

test("propose 422 doğrulama-başarısız yanıtını hâlâ düzenlenebilir taslak olarak döndürür", async () => {
  requests.length = 0;
  proposeStatus = 422;
  proposeBody = {
    idempotency_key: "key-2",
    source_recipe_id: "recipe-1",
    draft: {
      title: "Tuhaf Taslak",
      description: null,
      servings: null,
      prepMinutes: null,
      cookMinutes: null,
      restMinutes: null,
      difficulty: null,
      ingredients: [],
      steps: [],
    },
    changedFields: [],
    validation: { valid: false, issues: [{ code: "NO_INGREDIENTS", message: "Malzeme yok" }] },
  };

  const result = await proposeCustomization({
    sourceRecipeId: "recipe-1",
    instruction: "Her şeyi değiştir",
    idempotencyKey: "key-2",
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.issues, [{ code: "NO_INGREDIENTS", message: "Malzeme yok" }]);
  assert.equal(result.draft.title, "Tuhaf Taslak");
});

test("propose gerçek hata (draft yok) CustomizeRecipeError fırlatır", async () => {
  requests.length = 0;
  proposeStatus = 403;
  proposeBody = { error: "source_not_eligible" };

  await assert.rejects(
    () =>
      proposeCustomization({
        sourceRecipeId: "recipe-1",
        instruction: "Eti çıkar",
        idempotencyKey: "key-3",
      }),
    (err) => err instanceof CustomizeRecipeError && err.code === "source_not_eligible",
  );
});

test("save Faz A'dan gelen AYNI idempotency_key'i RPC'ye p_idempotency_key olarak gönderir", async () => {
  requests.length = 0;
  rpcResponse = { data: "new-recipe-id", error: null };

  const draft = {
    title: "Etsiz Karnıyarık",
    description: null,
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 40,
    restMinutes: null,
    difficulty: "orta",
    ingredients: [
      { crop: "patlican", freeTextName: "Patlıcan", quantity: 4, unit: "adet", note: null, isKeyIngredient: true, sortOrder: 0 },
    ],
    steps: [{ stepNo: 1, instruction: "Patlıcanları közle.", timerSeconds: null }],
  };

  const newId = await saveCustomization({
    idempotencyKey: "shared-key-42",
    sourceRecipeId: "recipe-1",
    draft,
  });

  const call = requests.find((r) => r.url.pathname.endsWith("/rest/v1/rpc/rpc_create_ai_customized_recipe"));
  assert.equal(call.body.p_idempotency_key, "shared-key-42");
  assert.equal(call.body.p_source_recipe_id, "recipe-1");
  assert.deepEqual(call.body.p_ingredients, draft.ingredients);
  assert.deepEqual(call.body.p_steps, draft.steps);
  assert.equal(newId, "new-recipe-id");
});

test("save RPC'nin uygunluk exception'ını source_not_eligible koduna çevirir", async () => {
  requests.length = 0;
  rpcResponse = {
    data: null,
    error: { message: "source recipe is not eligible for AI customization (must be public and not author_type=kullanici)" },
  };

  await assert.rejects(
    () =>
      saveCustomization({
        idempotencyKey: "key-4",
        sourceRecipeId: "recipe-1",
        draft: {
          title: "x",
          description: null,
          servings: null,
          prepMinutes: null,
          cookMinutes: null,
          restMinutes: null,
          difficulty: null,
          ingredients: [],
          steps: [],
        },
      }),
    (err) => err instanceof CustomizeRecipeError && err.code === "source_not_eligible",
  );
});
