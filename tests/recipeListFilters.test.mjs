import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installRuntime } from "./recipeTestRuntime.mjs";
import { allergenFixtures, recipeRow } from "./recipeFacts.fixtures.mjs";

installRuntime();
const { ALLERGEN_OPTIONS } = await import("../src/lib/hasat/recipeFacts.ts");
const {
  EMPTY_RECIPE_FILTERS,
  EQUIPMENT_OPTIONS,
  activeFilterCount,
  matchesRecipeFilters,
} = await import("../src/lib/hasat/recipeListFilters.ts");

function recipe(overrides = {}) {
  return {
    ...recipeRow(allergenFixtures.reviewed_without_labels),
    displayPhotoUrl: null,
    isRepresentativePhoto: false,
    ...overrides,
  };
}

const availability = { coverageAvailable: true, availableCount: 2 };

test("filter exposes the exact 12-slug shared mobile/web taxonomy", () => {
  assert.deepEqual(
    ALLERGEN_OPTIONS.map(({ slug, label }) => [slug, label]),
    [
      ["gluten", "Gluten"],
      ["laktoz", "Laktoz"],
      ["yumurta", "Yumurta"],
      ["findik-yerfistigi", "Fındık / yer fıstığı"],
      ["agac-kuruyemisi", "Diğer ağaç kuruyemişleri"],
      ["soya", "Soya"],
      ["susam", "Susam"],
      ["deniz-urunu", "Deniz ürünü"],
      ["hardal", "Hardal"],
      ["kereviz", "Kereviz"],
      ["sulfit", "Sülfit"],
      ["lupin", "Lupin"],
    ],
  );
});

test("allergen exclusion is multi-select AND and fails closed for every untrusted shape", () => {
  const selected = { ...EMPTY_RECIPE_FILTERS, excludedAllergens: ["laktoz", "soya"] };
  assert.equal(matchesRecipeFilters(recipe({ allergen_labels: ["gluten"] }), selected, availability), true);
  assert.equal(matchesRecipeFilters(recipe({ allergen_labels: ["soya"] }), selected, availability), false);
  for (const overrides of [
    { allergens_reviewed: false },
    { allergens_reviewed_at: null },
    { allergens_reviewed_at: "broken" },
    { allergen_labels: null },
    { allergen_labels: ["bilinmeyen"] },
    { allergen_labels: ["gluten", "gluten"] },
    { allergen_labels: "gluten" },
  ]) assert.equal(matchesRecipeFilters(recipe(overrides), selected, availability), false);
});

test("reviewed-empty is trusted but never presented as a safety claim", () => {
  const filters = { ...EMPTY_RECIPE_FILTERS, excludedAllergens: ["gluten"] };
  assert.equal(matchesRecipeFilters(recipe(), filters, availability), true);
  assert.equal(matchesRecipeFilters(recipe({ allergens_reviewed: false }), filters, availability), false);
});

test("each newly controlled slug participates in fail-closed AND-exclusion", () => {
  for (const slug of ["agac-kuruyemisi", "hardal", "kereviz", "sulfit", "lupin"]) {
    const filters = { ...EMPTY_RECIPE_FILTERS, excludedAllergens: [slug] };
    assert.equal(
      matchesRecipeFilters(recipe({ allergen_labels: [slug] }), filters, availability),
      false,
      slug,
    );
    assert.equal(
      matchesRecipeFilters(recipe({ allergen_labels: ["gluten"] }), filters, availability),
      true,
      slug,
    );
  }
});

test("equipment uses the exact web taxonomy and requires every selected slug", () => {
  assert.deepEqual(
    EQUIPMENT_OPTIONS.map(({ slug }) => slug),
    ["firin", "ocak", "mikrodalga", "airfryer", "blender", "mutfak-robotu", "duduklu-tencere", "izgara", "ozel-ekipman-gerekmiyor"],
  );
  const filters = { ...EMPTY_RECIPE_FILTERS, equipment: ["firin", "blender"] };
  assert.equal(matchesRecipeFilters(recipe({ required_equipment: ["firin", "blender"] }), filters, availability), true);
  assert.equal(matchesRecipeFilters(recipe({ required_equipment: ["firin"] }), filters, availability), false);
  assert.equal(matchesRecipeFilters(recipe({ required_equipment: [] }), filters, availability), false);
});

test("all groups compose and active count/clear include both new multi-select groups", () => {
  const filters = {
    duration: "30",
    diet: "vegan",
    onlyAvailable: true,
    excludedAllergens: ["laktoz", "soya"],
    equipment: ["firin", "blender"],
  };
  const matching = recipe({
    prep_minutes: 10,
    cook_minutes: 20,
    diet_tags: ["vegan"],
    allergen_labels: ["gluten"],
    required_equipment: ["firin", "blender"],
  });
  assert.equal(activeFilterCount(filters), 7);
  assert.equal(matchesRecipeFilters(matching, filters, availability), true);
  assert.equal(matchesRecipeFilters(matching, filters, { coverageAvailable: true, availableCount: 0 }), false);
  assert.equal(matchesRecipeFilters({ ...matching, diet_tags: [] }, filters, availability), false);
  assert.equal(matchesRecipeFilters({ ...matching, cook_minutes: 40 }, filters, availability), false);
  assert.equal(activeFilterCount(EMPTY_RECIPE_FILTERS), 0);
  assert.deepEqual(EMPTY_RECIPE_FILTERS.excludedAllergens, []);
  assert.deepEqual(EMPTY_RECIPE_FILTERS.equipment, []);
});

test("new allergen slugs compose with multi-equipment selection", () => {
  const filters = {
    ...EMPTY_RECIPE_FILTERS,
    excludedAllergens: ["agac-kuruyemisi", "hardal"],
    equipment: ["firin", "blender"],
  };
  const matching = recipe({
    allergen_labels: ["kereviz"],
    required_equipment: ["firin", "blender"],
  });
  assert.equal(matchesRecipeFilters(matching, filters, availability), true);
  assert.equal(
    matchesRecipeFilters({ ...matching, allergen_labels: ["hardal"] }, filters, availability),
    false,
  );
  assert.equal(
    matchesRecipeFilters({ ...matching, required_equipment: ["firin"] }, filters, availability),
    false,
  );
});

test("native filter sheet preserves modal, Dynamic Type, safe-area and screen-reader contracts", async () => {
  const sheet = await readFile(
    new URL("../src/components/hasat/RecipeFilterSheet.tsx", import.meta.url),
    "utf8",
  );
  const home = await readFile(new URL("../app/home.tsx", import.meta.url), "utf8");
  assert.match(sheet, /accessibilityViewIsModal/);
  assert.match(sheet, /accessibilityRole=\{multiSelect \? "checkbox" : "button"\}/);
  assert.match(sheet, /accessibilityState=\{multiSelect \? \{ checked: active \}/);
  assert.match(sheet, /className="min-h-12 justify-center/);
  assert.match(sheet, /paddingBottom: insets\.bottom \+ 16/);
  assert.match(sheet, /accessibilityRole="header"/);
  assert.doesNotMatch(sheet, /allowFontScaling=\{false\}|numberOfLines=/);
  assert.match(home, /Doğrulanmamış alerjen bilgisine sahip tarifler bu filtrede gösterilmez\./);
  assert.match(sheet, /ALLERGEN_OPTIONS\.map/);
});
