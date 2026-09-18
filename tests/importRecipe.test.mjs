import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { installRuntime } from "./recipeTestRuntime.mjs";

const requests = [];
let responseStatus = 200;
let responseBody = null;

globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });
      assert.ok(
        url.pathname.endsWith("/functions/v1/extract-recipe") ||
          url.pathname.endsWith("/rest/v1/rpc/rpc_update_private_recipe"),
      );
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});

installRuntime();
const { extractRecipe, ImportError, saveDraft } = await import("../src/lib/hasat/import.ts");

test("OCR/text create çağrısı client operation_key'i Edge sözleşmesine taşır", async () => {
  requests.length = 0;
  responseStatus = 200;
  responseBody = {
    recipe: { id: "recipe-1", title: "Tarif", extraction_confidence: 0.9 },
    ingredient_count: 2,
    step_count: 1,
    crop_linked_count: 1,
  };

  const result = await extractRecipe({
    mode: "text",
    operationKey: "00000000-0000-4000-8000-000000000010",
    text: "Domatesi doğra ve pişir.",
    recipeName: "Domates",
  });

  assert.equal(result.recipeId, "recipe-1");
  assert.equal(requests[0].body.operation_key, "00000000-0000-4000-8000-000000000010");
  assert.equal(requests[0].body.visibility, undefined);
  assert.equal(requests[0].body.status, undefined);
});

test("Edge idempotency conflict güvenli ve anlaşılır mesaja çevrilir", async () => {
  responseStatus = 409;
  responseBody = { error: "idempotency_conflict" };

  await assert.rejects(
    () =>
      extractRecipe({
        mode: "text",
        operationKey: "00000000-0000-4000-8000-000000000011",
        text: "Domatesi doğra ve pişir.",
      }),
    (error) =>
      error instanceof ImportError &&
      error.code === "idempotency_conflict" &&
      error.message.includes("geçerli değil"),
  );
});

test("title-only save mevcut step photo_url değerini atomik payload içinde korur", async () => {
  requests.length = 0;
  responseStatus = 200;
  responseBody = { recipe_id: "recipe-1", version: 2 };
  const photoUrl =
    "https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/recipe-step-photos/user-1/recipe-1/step.jpg";
  const operationKeys = {
    acquire: () => "00000000-0000-4000-8000-000000000012",
    succeed: () => {},
  };
  const draft = {
    recipeId: "recipe-1",
    privateEditVersion: 1,
    title: "Yalnız başlık değişti",
    description: null,
    servings: "2",
    prepMinutes: "",
    cookMinutes: "",
    restMinutes: "",
    difficulty: null,
    extractionConfidence: null,
    ingredients: [],
    steps: [{ key: "step-1", instruction: "Pişir.", timerMinutes: "", photoUrl }],
  };

  const saved = await saveDraft(draft, operationKeys);

  assert.equal(saved.privateEditVersion, 2);
  assert.equal(requests[0].body.p_payload.steps[0].photo_url, photoUrl);
});

test("Fotoğrafı kaldır save payload'ında açık photo_url=null gönderir", async () => {
  requests.length = 0;
  responseStatus = 200;
  responseBody = { recipe_id: "recipe-1", version: 3 };
  const operationKeys = {
    acquire: () => "00000000-0000-4000-8000-000000000013",
    succeed: () => {},
  };

  await saveDraft(
    {
      recipeId: "recipe-1",
      privateEditVersion: 2,
      title: "Fotoğrafsız",
      description: null,
      servings: "2",
      prepMinutes: "",
      cookMinutes: "",
      restMinutes: "",
      difficulty: null,
      extractionConfidence: null,
      ingredients: [],
      steps: [{ key: "step-1", instruction: "Pişir.", timerMinutes: "", photoUrl: null }],
    },
    operationKeys,
  );

  assert.equal(requests[0].body.p_payload.steps[0].photo_url, null);
});
