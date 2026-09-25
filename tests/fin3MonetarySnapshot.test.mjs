// FIN-3-M — Mobil parasal snapshot paritesi: `mapBuyerOfferRow`/`mapBuyerOrderRow`
// web'in `dbToOffer`/`dbToOrder` öncelik kuralını birebir uygulamalı.
import assert from "node:assert/strict";
import test from "node:test";
import { installRuntime } from "./recipeTestRuntime.mjs";

installRuntime();
const { mapBuyerOfferRow, mapBuyerOrderRow } = await import("../src/lib/hasat/orders.ts");

const base = {
  quantity: 10,
  price_per_unit: 100,
  current_quantity: null,
  current_price: null,
  final_quantity: null,
  final_price_per_unit: null,
  snapshot_crop: "Domates",
  snapshot_unit: "kg",
  listing: { crop: "Domates", unit: "kg" },
};

const cases = [
  {
    name: "pazarlıklı kabul → final_* kazanır",
    offer: { ...base, current_price: 90, current_quantity: 12, final_price_per_unit: 90, final_quantity: 12 },
    expect: { crop: "Domates", unit: "kg", quantity: 12, pricePerUnit: 90, total: 1080 },
  },
  {
    name: "geri çekilmiş karşı teklif: quantity/price_per_unit bayat, final_* doğru",
    offer: { ...base, quantity: 15, price_per_unit: 80, current_quantity: 10, current_price: 100, final_quantity: 10, final_price_per_unit: 100 },
    expect: { crop: "Domates", unit: "kg", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
  {
    name: "pazarlık sürüyor → current_*",
    offer: { ...base, current_price: 95, current_quantity: 11 },
    expect: { crop: "Domates", unit: "kg", quantity: 11, pricePerUnit: 95, total: 1045 },
  },
  {
    name: "hiç pazarlık yok → orijinal alanlar",
    offer: { ...base },
    expect: { crop: "Domates", unit: "kg", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
  {
    name: "ilan silinmiş → snapshot",
    offer: { ...base, snapshot_crop: "Biber", snapshot_unit: "adet", listing: null },
    expect: { crop: "Biber", unit: "adet", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
  {
    name: "ilan düzenlenmiş → snapshot kazanır",
    offer: { ...base, snapshot_crop: "Domates", snapshot_unit: "kg", listing: { crop: "Salkım Domates", unit: "kasa" } },
    expect: { crop: "Domates", unit: "kg", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
  {
    name: "eski satır (snapshot null) → listing fallback",
    offer: { ...base, snapshot_crop: null, snapshot_unit: null, listing: { crop: "Patates", unit: "ton" } },
    expect: { crop: "Patates", unit: "ton", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
  {
    name: "snapshot ve listing yok → varsayılanlar",
    offer: { ...base, snapshot_crop: null, snapshot_unit: null, listing: null },
    expect: { crop: "—", unit: "kg", quantity: 10, pricePerUnit: 100, total: 1000 },
  },
];

for (const c of cases) {
  test(`mapBuyerOfferRow: ${c.name}`, () => {
    const row = mapBuyerOfferRow({
      id: "o1",
      status: "accepted",
      ball_side: "buyer",
      payment_status: null,
      created_at: "2026-09-25T00:00:00Z",
      farmer: { name: "Ali", city: "Antalya" },
      ...c.offer,
    });
    assert.equal(row.crop, c.expect.crop);
    assert.equal(row.unit, c.expect.unit);
    assert.equal(row.quantity, c.expect.quantity);
    assert.equal(row.pricePerUnit, c.expect.pricePerUnit);
    assert.equal(row.quantity * row.pricePerUnit, c.expect.total);
  });

  test(`mapBuyerOrderRow: ${c.name}`, () => {
    const row = mapBuyerOrderRow({
      id: "r1",
      order_ref: "HST-1",
      status: "preparing",
      created_at: "2026-09-25T00:00:00Z",
      farmer: { name: "Ali" },
      offer: c.offer,
    });
    assert.equal(row.code, "HST-1");
    assert.equal(row.crop, c.expect.crop);
    assert.equal(row.unit, c.expect.unit);
    assert.equal(row.quantity, c.expect.quantity);
    assert.equal(row.pricePerUnit, c.expect.pricePerUnit);
    assert.equal(row.total, c.expect.total);
  });
}

test("mapBuyerOfferRow: numeric string kolonlar sayıya çevrilir, pending_* → pending", () => {
  const row = mapBuyerOfferRow({ ...base, id: "o2", status: "pending_farmer", final_quantity: "12.5", final_price_per_unit: "40" });
  assert.equal(row.quantity, 12.5);
  assert.equal(row.pricePerUnit, 40);
  assert.equal(row.status, "pending");
  assert.equal(row.paymentStatus, "unpaid");
});

test("mapBuyerOrderRow: offer join null → sıfır tutar, varsayılan ürün", () => {
  const row = mapBuyerOrderRow({ id: "r2", order_ref: "HST-2", status: "preparing", created_at: "x", farmer: null, offer: null });
  assert.deepEqual([row.crop, row.unit, row.quantity, row.pricePerUnit, row.total, row.farmerName], ["—", "kg", 0, 0, 0, null]);
});
