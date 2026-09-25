// FIN-3-S — Mobil stok gösterimi `listing_stock_summary` RPC'sinin tek kaynağına
// bağlı: `mapListingStockSummary` ilk satırı `ListingStock`'a çevirir.
import assert from "node:assert/strict";
import test from "node:test";
import { installRuntime } from "./recipeTestRuntime.mjs";

installRuntime();
const { mapListingStockSummary } = await import("../src/lib/hasat/offers.ts");

test("satır var → ilk satırın alanları", () => {
  assert.deepEqual(
    mapListingStockSummary([
      { base: 100, reserved: 30, available: 70, linked_count: 2, using_fallback: false },
      { base: 999, reserved: 999, available: 999, linked_count: 9, using_fallback: true },
    ]),
    { base: 100, reserved: 30, available: 70 },
  );
});

test("satır yok (aktif olmayan / başkasının ilanı) → sıfır stok, hata yok", () => {
  const zero = { base: 0, reserved: 0, available: 0 };
  assert.deepEqual(mapListingStockSummary([]), zero);
  assert.deepEqual(mapListingStockSummary(null), zero);
  assert.deepEqual(mapListingStockSummary(undefined), zero);
});

test("PostgREST numeric string alanları Number'a çevrilir", () => {
  const out = mapListingStockSummary([
    { base: "12.5", reserved: "2.25", available: "10.25", linked_count: "1", using_fallback: true },
  ]);
  assert.deepEqual(out, { base: 12.5, reserved: 2.25, available: 10.25 });
  for (const v of Object.values(out)) assert.equal(typeof v, "number");
});
