import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { installRuntime } from "./recipeTestRuntime.mjs";
import { nutritionFixtures, allergenFixtures, recipeRow, unavailable } from "./recipeFacts.fixtures.mjs";

const sqlite = new DatabaseSync(":memory:");
let injectedFailure = false;
globalThis.__recipeDb = {
  execAsync: async sql => sqlite.exec(sql),
  runAsync: async (sql, values = []) => {
    if (injectedFailure && sql.includes("INSERT INTO cached_recipe_steps")) throw new Error("fixture disk failure");
    return sqlite.prepare(sql).run(...values);
  },
  getFirstAsync: async (sql, values = []) => sqlite.prepare(sql).get(...values) ?? null,
  getAllAsync: async (sql, values = []) => sqlite.prepare(sql).all(...values),
  withTransactionAsync: async fn => {
    sqlite.exec("BEGIN");
    try { await fn(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
installRuntime();
const cache = await import("../src/lib/offline/recipeCache.ts");
const { mapRecipeFacts, getReviewedAllergens, getNutritionState } = await import("../src/lib/hasat/recipeFacts.ts");
const { EMPTY_RECIPE_FILTERS, matchesRecipeFilters } = await import("../src/lib/hasat/recipeListFilters.ts");
const { deserializeRecipeFacts } = await import("../src/lib/offline/recipeFactsCache.ts");
function detail(facts) { return { ...recipeRow(facts), displayPhotoUrl: "https://example.test/cover.webp", isRepresentativePhoto: false }; }
const steps = [{ id: "step-1", step_no: 1, instruction: "Fixture step", photo_url: null, timer_seconds: 0 }];
const ingredients = [{ id: "ing-1", sort_order: 1, crop: "domates", free_text_name: null, quantity: 0, unit: "g", note: null, is_key_ingredient: true, ingredient_class: null }];

test("upgrade a real legacy SQLite cache without losing content or trusting old labels", async () => {
  sqlite.exec(`CREATE TABLE cached_recipes (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT,
    display_photo_url TEXT, is_representative_photo INTEGER NOT NULL DEFAULT 0, servings INTEGER,
    prep_minutes INTEGER, cook_minutes INTEGER, rest_minutes INTEGER, difficulty TEXT, cuisine TEXT,
    diet_tags TEXT NOT NULL DEFAULT '[]', cached_at INTEGER NOT NULL);
    INSERT INTO cached_recipes(id,slug,title,servings,cached_at) VALUES ('legacy','legacy','Legacy',2,123);
    CREATE TABLE cached_recipe_detail_meta(recipe_id TEXT PRIMARY KEY,cached_at INTEGER NOT NULL);
    INSERT INTO cached_recipe_detail_meta VALUES ('legacy',123);`);
  const found = await cache.getCachedRecipeDetail("legacy");
  assert.equal(found.recipe.title, "Legacy");
  assert.equal(found.cachedAt, 123);
  assert.deepEqual(mapRecipeFacts(found.recipe), unavailable);
  assert.equal(getReviewedAllergens(found.recipe).reviewState, "unreviewed");
  assert.equal((await cache.getDetailCacheStats()).count, 0);
  assert.equal(sqlite.prepare("PRAGMA user_version").get().user_version, 2);
  assert.deepEqual(found.recipe.required_equipment, []);
  assert.equal(matchesRecipeFilters(found.recipe, {
    ...EMPTY_RECIPE_FILTERS,
    excludedAllergens: ["gluten"],
  }, { coverageAvailable: false }), false);
  // Simulate a process restart: CREATE IF NOT EXISTS + version guard must be idempotent.
  const restarted = await import("../src/lib/offline/db.ts?restart");
  await restarted.getDb();
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM cached_recipes").get().n, 1);
});
for (const [state, facts] of Object.entries({ ...nutritionFixtures, ...allergenFixtures })) {
  test(`real SQLite serialization + hydration round-trip: ${state}`, async () => {
    await cache.cacheRecipeDetail(detail(facts), steps, ingredients);
    const found = await cache.getCachedRecipeDetail("fixture-recipe");
    assert.deepEqual(mapRecipeFacts(found.recipe), facts);
    assert.deepEqual(found.steps, steps);
    assert.deepEqual(found.ingredients, ingredients);
    if (state in nutritionFixtures)
      assert.equal(
        getNutritionState(found.recipe),
        state.startsWith("partial") ? "partial" : state,
      );
    if (state in allergenFixtures) assert.equal(getReviewedAllergens(found.recipe).reviewState, state);
  });
}
test("list refresh updates filter facts, preserves nutrition and carries equipment", async () => {
  const reviewedNutrition = {
    ...nutritionFixtures.computed,
    allergen_labels: ["gluten"],
    allergens_reviewed: true,
    allergens_reviewed_at: "2026-09-07T00:00:00Z",
  };
  await cache.cacheRecipeDetail(detail(reviewedNutrition), steps, ingredients);
  await cache.cacheRecipeList([{ ...detail(allergenFixtures.unreviewed), required_equipment: ["firin"] }]);
  const refreshed = (await cache.getCachedRecipeDetail("fixture-recipe")).recipe;
  assert.equal(getNutritionState(refreshed), "computed");
  assert.equal(getReviewedAllergens(refreshed).reviewState, "unreviewed");
  assert.deepEqual(refreshed.required_equipment, ["firin"]);
  await cache.cacheRecipeDetail(detail(unavailable), steps, ingredients);
  assert.deepEqual(mapRecipeFacts((await cache.getCachedRecipeDetail("fixture-recipe")).recipe), unavailable);
});
test("all 12 controlled allergens survive cache/offline hydration while unknown stays fail-closed", async () => {
  const twelve = [
    "gluten", "laktoz", "yumurta", "findik-yerfistigi", "agac-kuruyemisi", "soya",
    "susam", "deniz-urunu", "hardal", "kereviz", "sulfit", "lupin",
  ];
  await cache.cacheRecipeDetail(detail({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: twelve,
  }), steps, ingredients);
  const hydrated = (await cache.getCachedRecipeDetail("fixture-recipe")).recipe;
  assert.deepEqual(getReviewedAllergens(hydrated).labels, twelve);
  assert.equal(matchesRecipeFilters(hydrated, {
    ...EMPTY_RECIPE_FILTERS,
    excludedAllergens: ["hardal"],
    equipment: [],
  }, { coverageAvailable: false }), false);

  await cache.cacheRecipeDetail(detail({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: ["future-thirteenth-allergen"],
  }), steps, ingredients);
  const unknown = (await cache.getCachedRecipeDetail("fixture-recipe")).recipe;
  assert.equal(getReviewedAllergens(unknown).reviewState, "unreviewed");
  assert.equal(matchesRecipeFilters(unknown, {
    ...EMPTY_RECIPE_FILTERS,
    excludedAllergens: ["gluten"],
  }, { coverageAvailable: false }), false);
});
test("detail replacement is atomic when a step write fails", async () => {
  await cache.cacheRecipeDetail(detail(nutritionFixtures.computed), steps, ingredients);
  injectedFailure = true;
  await assert.rejects(cache.cacheRecipeDetail(detail(unavailable), steps, ingredients));
  injectedFailure = false;
  assert.deepEqual(mapRecipeFacts((await cache.getCachedRecipeDetail("fixture-recipe")).recipe), nutritionFixtures.computed);
});
test("list removal deletes orphan facts, steps, ingredients and detail metadata", async () => {
  await cache.cacheRecipeList([]);
  assert.equal(await cache.getCachedRecipeDetail("fixture-recipe"), null);
  for (const table of ["cached_recipes", "cached_recipe_steps", "cached_recipe_ingredients", "cached_recipe_detail_meta"])
    assert.equal(sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
});
test("damaged, absent and unknown cache payload versions fail closed", () => {
  for (const raw of [null, undefined, "", "{", "null", "[]", '{"version":2,"facts":{}}', '{"version":1,"facts":[]}'])
    assert.deepEqual(deserializeRecipeFacts(raw), unavailable);
});
test("fresh installs create the versioned cache; restarting preserves detail freshness", async () => {
  const fresh = new DatabaseSync(":memory:");
  const savedAdapter = globalThis.__recipeDb;
  globalThis.__recipeDb = {
    execAsync: async sql => fresh.exec(sql),
    runAsync: async sql => fresh.prepare(sql).run(),
    getFirstAsync: async sql => fresh.prepare(sql).get(),
    withTransactionAsync: async fn => { fresh.exec("BEGIN"); try { await fn(); fresh.exec("COMMIT"); } catch (e) { fresh.exec("ROLLBACK"); throw e; } },
  };
  const first = await import("../src/lib/offline/db.ts?fresh");
  await first.getDb();
  assert.equal(fresh.prepare("PRAGMA user_version").get().user_version, 2);
  fresh.exec("INSERT INTO cached_recipe_detail_meta VALUES ('test',123)");
  const second = await import("../src/lib/offline/db.ts?fresh-restart");
  await second.getDb();
  assert.equal(fresh.prepare("SELECT cached_at FROM cached_recipe_detail_meta").get().cached_at, 123);
  globalThis.__recipeDb = savedAdapter;
  fresh.close();
});
test("public hook maps network payload into SQLite and hydrates it offline/on network error", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  let networkError = false;
  globalThis.__recipeClient = createClient("https://example.test", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      if (networkError) return new Response(JSON.stringify({ message: "offline fixture" }), { status: 400 });
      const data = new URL(String(input)).pathname.endsWith("/recipes") ? recipeRow(nutritionFixtures.partial) : [];
      return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const { useRecipeDetail } = await import("../src/lib/hasat/recipes.ts");
  globalThis.__offline = false;
  const fresh = await useRecipeDetail("fixture-recipe").queryFn();
  assert.deepEqual(mapRecipeFacts(fresh.recipe), nutritionFixtures.partial);
  globalThis.__offline = true;
  const offline = await useRecipeDetail("fixture-recipe").queryFn();
  assert.deepEqual(mapRecipeFacts(offline.recipe), nutritionFixtures.partial);
  globalThis.__offline = false;
  networkError = true;
  const fallback = await useRecipeDetail("fixture-recipe").queryFn();
  assert.deepEqual(mapRecipeFacts(fallback.recipe), nutritionFixtures.partial);
});
