import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { installRuntime } from "./recipeTestRuntime.mjs";
import { allergenFixtures, recipeRow } from "./recipeFacts.fixtures.mjs";

const sqlite = new DatabaseSync(":memory:");
globalThis.__recipeDb = {
  execAsync: async sql => sqlite.exec(sql),
  runAsync: async (sql, values = []) => sqlite.prepare(sql).run(...values),
  getFirstAsync: async (sql, values = []) => sqlite.prepare(sql).get(...values) ?? null,
  getAllAsync: async (sql, values = []) => sqlite.prepare(sql).all(...values),
  withTransactionAsync: async fn => {
    sqlite.exec("BEGIN");
    try { await fn(); sqlite.exec("COMMIT"); } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
installRuntime();
const {
  formatIngredientUnit,
  formatQuantity,
  formatUnquantifiedIngredient,
  isSquareCoverUrl,
} = await import("../src/lib/hasat/format.ts");
const { cropEmoji, NEUTRAL_INGREDIENT_EMOJI } = await import("../src/lib/hasat/crop-emoji.ts");
const { EMPTY_RECIPE_FILTERS, matchesRecipeFilters } = await import("../src/lib/hasat/recipeListFilters.ts");
const cache = await import("../src/lib/offline/recipeCache.ts");

test("formatIngredientUnit maps every pipeline slug to its Turkish label", () => {
  const expected = {
    su_bardagi: "su bardağı",
    yemek_kasigi: "yemek kaşığı",
    tatli_kasigi: "tatlı kaşığı",
    cay_kasigi: "çay kaşığı",
    cay_bardagi: "çay bardağı",
    dis: "diş",
    avuc: "avuç",
    salkim: "salkım",
    l: "litre",
  };
  for (const [stored, shown] of Object.entries(expected)) assert.equal(formatIngredientUnit(stored), shown);
});

test("formatIngredientUnit passes Turkish values through, spaces unknown slugs, empties null", () => {
  for (const turkish of ["su bardağı", "yemek kaşığı", "g", "kg", "adet", "tutam"])
    assert.equal(formatIngredientUnit(turkish), turkish);
  assert.equal(formatIngredientUnit("orta_boy_dilim"), "orta boy dilim");
  assert.equal(formatIngredientUnit(null), "");
  assert.equal(formatIngredientUnit(undefined), "");
});

test("quantity line: raw unit drives decimals, display unit is formatted", () => {
  const line = `${formatQuantity(1.5, "su_bardagi")} ${formatIngredientUnit("su_bardagi")}`;
  assert.equal(line, "1,5 su bardağı");
});

test("unquantified ingredients map exclusion reasons to readable text", () => {
  assert.equal(formatUnquantifiedIngredient("seasoning_to_taste_unquantified"), "damak tadına göre");
  assert.equal(formatUnquantifiedIngredient("serving_only_unquantified"), "servis için");
  assert.equal(formatUnquantifiedIngredient("trace_flavoring_unquantified"), "bir miktar");
  assert.equal(formatUnquantifiedIngredient("some_future_reason"), "");
  assert.equal(formatUnquantifiedIngredient(null), "");
  assert.equal(formatUnquantifiedIngredient(undefined), "");
});

test("cropEmoji: crop first, then free-text override, then a neutral icon", () => {
  assert.equal(cropEmoji("nar"), "🍎");
  assert.equal(cropEmoji("Domates"), "🍅");
  assert.equal(cropEmoji(null, "pirinç"), "🍚");
  assert.equal(cropEmoji(null, "Su"), "💧");
  assert.equal(cropEmoji(null, " tuz "), "🧂");
  // crop wins over free text
  assert.equal(cropEmoji("limon", "su"), "🍋");
  // unknown crop falls through to free text
  assert.equal(cropEmoji("bilinmeyen-crop", "yumurta"), "🥚");
  for (const [crop, free] of [[null, "vanilya"], [null, null], [undefined, undefined], ["bilinmeyen", "bilinmeyen"]]) {
    assert.notEqual(cropEmoji(crop, free), "🌾");
    assert.equal(cropEmoji(crop, free), NEUTRAL_INGREDIENT_EMOJI);
  }
  // 🌾 stays for grains only
  assert.equal(cropEmoji("buğday"), "🌾");
  assert.equal(cropEmoji("arpa"), "🌾");
});

test("cropEmoji covers the full web-aligned override table", () => {
  const table = {
    pirinç: "🍚", nar: "🍎", kabak: "🥒", salatalık: "🥒", ayva: "🍐",
    portakal: "🍊", mandalina: "🍊", greyfurt: "🍊", limon: "🍋", patates: "🥔",
    soğan: "🧅", sarımsak: "🧄", havuç: "🥕", muz: "🍌", zencefil: "🫚",
    şeker: "🍬", tuz: "🧂", su: "💧", süt: "🥛", yumurta: "🥚", tereyağı: "🧈", bal: "🍯",
  };
  for (const [name, emoji] of Object.entries(table)) assert.equal(cropEmoji(null, name), emoji, name);
});

function recipe(diet_tags) {
  return {
    ...recipeRow(allergenFixtures.reviewed_without_labels),
    displayPhotoUrl: null,
    isRepresentativePhoto: false,
    diet_tags,
  };
}
const availability = { coverageAvailable: false };

test("diet filter: vegan ⊂ vejetaryen, not the other way round", () => {
  const vejetaryen = { ...EMPTY_RECIPE_FILTERS, diet: "vejetaryen" };
  const vegan = { ...EMPTY_RECIPE_FILTERS, diet: "vegan" };
  assert.equal(matchesRecipeFilters(recipe(["vegan"]), vejetaryen, availability), true);
  assert.equal(matchesRecipeFilters(recipe(["vejetaryen"]), vejetaryen, availability), true);
  assert.equal(matchesRecipeFilters(recipe(["vegan", "vejetaryen"]), vegan, availability), true);
  assert.equal(matchesRecipeFilters(recipe(["vejetaryen"]), vegan, availability), false);
  assert.equal(matchesRecipeFilters(recipe([]), vejetaryen, availability), false);
  // other tags keep exact matching
  const glutensiz = { ...EMPTY_RECIPE_FILTERS, diet: "glutensiz" };
  assert.equal(matchesRecipeFilters(recipe(["vegan"]), glutensiz, availability), false);
  assert.equal(matchesRecipeFilters(recipe(["glutensiz"]), glutensiz, availability), true);
});

test("square cover detection only matches -1x1.webp", () => {
  assert.equal(isSquareCoverUrl("https://cdn.test/recipes/safranli-zerde-1x1.webp"), true);
  assert.equal(isSquareCoverUrl("https://cdn.test/recipes/safranli-zerde-1x1.webp?v=2"), true);
  assert.equal(isSquareCoverUrl("https://cdn.test/recipes/pilav-16x9.webp"), false);
  assert.equal(isSquareCoverUrl("https://cdn.test/recipes/pilav.webp"), false);
  assert.equal(isSquareCoverUrl(null), false);
});

test("offline cache carries nutrition_exclusion_reason through the v3 upgrade", async () => {
  const detail = { ...recipe([]), displayPhotoUrl: null };
  const ingredients = [
    { id: "i1", sort_order: 1, crop: null, free_text_name: "tuz", quantity: null, unit: null, note: null, is_key_ingredient: false, ingredient_class: null, nutrition_exclusion_reason: "seasoning_to_taste_unquantified" },
    { id: "i2", sort_order: 2, crop: "domates", free_text_name: null, quantity: 2, unit: "adet", note: null, is_key_ingredient: true, ingredient_class: null, nutrition_exclusion_reason: null },
  ];
  await cache.cacheRecipeDetail(detail, [], ingredients);
  assert.equal(sqlite.prepare("PRAGMA user_version").get().user_version, 3);
  const found = await cache.getCachedRecipeDetail(detail.slug);
  assert.deepEqual(found.ingredients.map(i => i.nutrition_exclusion_reason), ["seasoning_to_taste_unquantified", null]);
});

test("detail screen wires unit formatter, unquantified text, emoji fallback and square cover", async () => {
  const screen = await readFile(new URL("../app/recipe/[slug].tsx", import.meta.url), "utf8");
  assert.match(screen, /formatIngredientUnit\(unit\)/);
  assert.match(screen, /formatQuantity\(qty, unit\)/);
  assert.match(screen, /formatUnquantifiedIngredient\(ingredient\.nutrition_exclusion_reason\)/);
  assert.match(screen, /cropEmoji\(ingredient\.crop, ingredient\.free_text_name\)/);
  assert.match(screen, /fitSquareCover/);
  // edit inputs keep the raw stored unit
  for (const file of ["../app/import.tsx", "../app/recipe-customize.tsx"]) {
    const src = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(src, /formatIngredientUnit/);
  }
});
