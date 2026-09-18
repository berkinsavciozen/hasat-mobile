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
      assert.ok(url.pathname.endsWith("/functions/v1/extract-recipe"));
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});

installRuntime();
const { extractRecipe, ImportError } = await import("../src/lib/hasat/import.ts");

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
