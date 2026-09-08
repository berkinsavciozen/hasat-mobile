import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { installRuntime } from "./recipeTestRuntime.mjs";
import {
  allergenFixtures,
  nutritionFixtures,
} from "./recipeFacts.fixtures.mjs";

installRuntime();
const presentation = await import("../src/lib/hasat/recipeDetailPresentation.ts");

const withServings = (facts, servings = 4) => ({ ...facts, servings });

test("computed, partial low/medium/99.5, estimated and unavailable copy is contract exact", () => {
  const computed = presentation.buildNutritionPresentation(
    withServings(nutritionFixtures.computed),
  );
  assert.equal(computed.state, "computed");
  assert.equal(
    computed.explanation,
    "Malzemelerin tamamı referans verilerle hesaplandı.",
  );

  for (const [fixture, expected] of [
    [nutritionFixtures.partialLow, 0],
    [nutritionFixtures.partialMedium, 50],
    [nutritionFixtures.partial995, 99],
  ]) {
    const model = presentation.buildNutritionPresentation(withServings(fixture));
    assert.equal(model.state, "partial");
    assert.equal(model.coveragePct, expected);
    assert.equal(
      model.explanation,
      `Malzemelerin %${expected} kadarı referans verilerle hesaplandı; kalan kısmı tahminidir.`,
    );
  }

  assert.equal(
    presentation.buildNutritionPresentation(
      withServings(nutritionFixtures.estimated),
    ).explanation,
    "Besin değerlerinin tamamı tahminidir.",
  );
  assert.deepEqual(
    presentation.buildNutritionPresentation(
      withServings(nutritionFixtures.unavailable),
    ),
    { state: "unavailable", message: "Besin bilgisi henüz hazır değil." },
  );
});

test("per-serving stays fixed while the explicitly selected N total scales", () => {
  const model = presentation.buildNutritionPresentation(
    withServings(nutritionFixtures.computed),
  );
  assert.equal(model.state, "computed");
  const original = structuredClone(model.perServing);
  assert.deepEqual(presentation.scaleNutrition(model.perServing, 1), original);
  assert.deepEqual(presentation.scaleNutrition(model.perServing, 3), {
    caloriesKcal: 1261.5,
    proteinG: 54,
    carbsG: 150,
    fatG: 48,
    fiberG: 0,
  });
  assert.deepEqual(model.perServing, original);
});

test("Turkish formatting, true zero, null fiber and invalid servings remain distinct", () => {
  assert.equal(presentation.formatNutritionNumber(420.56), "420,6");
  assert.equal(presentation.formatNutritionNumber(0), "0");
  const nullFiber = presentation.buildNutritionPresentation(
    withServings({ ...nutritionFixtures.computed, fiber_g: null }),
  );
  assert.equal(nullFiber.state, "computed");
  assert.equal(nullFiber.perServing.fiberG, null);
  assert.equal(
    presentation.buildNutritionPresentation(
      withServings(nutritionFixtures.computed, 0),
    ).state,
    "unavailable",
  );
  assert.equal(
    presentation.buildNutritionPresentation(
      withServings(nutritionFixtures.computed, Number.NaN),
    ).state,
    "unavailable",
  );
});

test("stale_reference never creates a stale/recalculating presentation state", () => {
  const model = presentation.buildNutritionPresentation(
    withServings({
      ...nutritionFixtures.computed,
      nutrition_warnings: ["stale_reference"],
    }),
  );
  assert.equal(model.state, "computed");
  assert.doesNotMatch(JSON.stringify(model), /yeniden hesap|recalculating/i);
});

test("allergen presentation covers one/seven labels, reviewed-empty and fail-closed unreviewed", () => {
  const one = presentation.buildAllergenPresentation({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: ["gluten"],
  });
  assert.deepEqual(one, {
    state: "reviewed_with_labels",
    labels: ["Gluten"],
    message: "İşaretlenenler:",
  });
  const seven = presentation.buildAllergenPresentation({
    ...allergenFixtures.reviewed_with_labels,
    allergen_labels: [
      "gluten",
      "laktoz",
      "yumurta",
      "findik-yerfistigi",
      "soya",
      "susam",
      "deniz-urunu",
    ],
  });
  assert.deepEqual(seven.labels, presentation.CONTROLLED_ALLERGEN_LABELS);
  assert.deepEqual(
    presentation.buildAllergenPresentation(
      allergenFixtures.reviewed_without_labels,
    ),
    {
      state: "reviewed_without_labels",
      labels: [],
      message:
        "İşaretlenmiş alerjen bulunmuyor — içerikleri ve çapraz bulaşma riskini ayrıca kontrol edin.",
    },
  );
  assert.deepEqual(
    presentation.buildAllergenPresentation(allergenFixtures.unreviewed),
    {
      state: "unreviewed",
      labels: null,
      message: "Alerjen bilgisi henüz doğrulanmadı.",
    },
  );
});

test("native layout keeps public information order and accessible, reflow-safe semantics", async () => {
  const route = await readFile(new URL("../app/recipe/[slug].tsx", import.meta.url), "utf8");
  const panels = await readFile(
    new URL("../src/components/hasat/RecipeFactsPanels.tsx", import.meta.url),
    "utf8",
  );
  const order = [
    "<ServingControl",
    "<RecipeNutritionPanel",
    "<RecipeAllergenPanel",
    "Malzemeler",
  ].map((token) => route.indexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(route, /!isOwn &&/);
  assert.match(route, /h-11 w-11/);
  assert.match(route, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(route, /accessibilityLiveRegion="polite"/);
  assert.match(route, /accessibilityRole="adjustable"/);
  assert.match(route, /accessibilityValue=/);
  assert.match(route, /accessibilityLabel="Porsiyonu azalt"/);
  assert.match(route, /accessibilityLabel="Porsiyonu artır"/);
  assert.match(panels, /flex-row flex-wrap gap-2/);
  assert.match(panels, /minWidth: 120/);
  for (const viewportWidth of [320, 430]) {
    const panelInnerWidth = viewportWidth - 40 - 32;
    assert.ok(panelInnerWidth >= 120);
    assert.ok(panelInnerWidth >= 120 * 2 + 8);
  }
  assert.doesNotMatch(panels, /numberOfLines|maxHeight|overflow-hidden/);
  assert.match(panels, /accessibilityRole="header"/);
  assert.match(panels, /accessibilityRole="summary"/);
  assert.match(panels, /İşaretlenen alerjen ve hassasiyetler/);
  assert.match(
    panels,
    /Bu bilgi tıbbi tavsiye değildir\. Ürün etiketlerini ve mutfaktaki çapraz/,
  );
});
