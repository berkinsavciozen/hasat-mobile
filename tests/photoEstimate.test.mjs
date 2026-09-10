// T7a-mobil — `estimate-recipe-from-photo` sonucunun (disclaimer + uncertain_notes
// dahil) doğru taşındığını ve hata kodlarının Türkçe mesaja çevrildiğini doğrular.
// Kabul kriteri #1/#2 UI tarafında (app/import.tsx review banner) test edilemiyor
// (bu repoda React Native bileşen render testi altyapısı yok — bkz. diğer
// testler, hepsi mantık/veri seviyesinde) ama bu dosya UI'nin dayandığı verinin
// (disclaimer HER ZAMAN dolu, uncertain_notes dizisi) sağlam geldiğini garanti eder.
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
      assert.ok(url.pathname.endsWith("/functions/v1/estimate-recipe-from-photo"));
      return new Response(JSON.stringify(responseBody), {
        status: responseStatus,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
});

installRuntime();
const { estimateRecipeFromPhoto, PhotoEstimateError } = await import(
  "../src/lib/hasat/photoEstimate.ts"
);

test("başarılı tahmin: disclaimer ve uncertain_notes taşınır, istek base64/mime/recipe_name gönderir", async () => {
  requests.length = 0;
  responseStatus = 200;
  responseBody = {
    recipe: { id: "recipe-9", title: "Muhtemelen Mercimek Köftesi", extraction_confidence: 0.45 },
    ingredient_count: 6,
    step_count: 4,
    crop_linked_count: 2,
    uncertain_notes: ["Sosta soya sosu olabilir, kesin değil."],
    disclaimer: "Bu tarif TAHMİN edilmiştir…",
  };

  const result = await estimateRecipeFromPhoto({
    imageBase64: "AAAA",
    imageMime: "image/jpeg",
    recipeName: "Köfte",
  });

  const call = requests[0];
  assert.equal(call.body.image_base64, "AAAA");
  assert.equal(call.body.image_mime, "image/jpeg");
  assert.equal(call.body.recipe_name, "Köfte");

  assert.equal(result.recipeId, "recipe-9");
  assert.equal(result.disclaimer, "Bu tarif TAHMİN edilmiştir…");
  assert.deepEqual(result.uncertainNotes, ["Sosta soya sosu olabilir, kesin değil."]);
  assert.equal(result.extractionConfidence, 0.45);
});

test("disclaimer eksik gelirse ai_bad_output olarak fırlatılır (asla sessizce yutulmaz)", async () => {
  requests.length = 0;
  responseStatus = 200;
  responseBody = {
    recipe: { id: "recipe-9", title: "x", extraction_confidence: null },
    ingredient_count: 1,
    step_count: 1,
    crop_linked_count: 0,
    uncertain_notes: [],
    // disclaimer YOK — dispatch'in "her zaman gösterilmeli" kuralı UI'ye
    // güvenilmez veri geçirmemeli.
  };

  await assert.rejects(
    () => estimateRecipeFromPhoto({ imageBase64: "AAAA" }),
    (err) => err instanceof PhotoEstimateError && err.code === "ai_bad_output",
  );
});

test("422 not_a_recipe reason'ı Türkçe mesaja katılır", async () => {
  requests.length = 0;
  responseStatus = 422;
  responseBody = { error: "not_a_recipe", reason: "fotoğrafta çiğ malzeme görünüyor" };

  await assert.rejects(
    () => estimateRecipeFromPhoto({ imageBase64: "AAAA" }),
    (err) =>
      err instanceof PhotoEstimateError &&
      err.code === "not_a_recipe" &&
      err.message.includes("fotoğrafta çiğ malzeme görünüyor"),
  );
});

test("429 quota_exceeded anlaşılır bir Türkçe mesaja çevrilir", async () => {
  requests.length = 0;
  responseStatus = 429;
  responseBody = { error: "quota_exceeded" };

  await assert.rejects(
    () => estimateRecipeFromPhoto({ imageBase64: "AAAA" }),
    (err) =>
      err instanceof PhotoEstimateError &&
      err.code === "quota_exceeded" &&
      err.message.includes("ayın başında yenilenir"),
  );
});
