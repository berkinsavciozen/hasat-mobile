import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { installRuntime } from "./recipeTestRuntime.mjs";

installRuntime();

const {
  buildOrderIntentBlockedPayload,
  canStartOrder,
  isOrdersDisabledError,
  parseOrderGate,
} = await import("../src/lib/hasat/orderGatePolicy.ts");

test("order gate allows the global switch or an allowlisted caller", () => {
  assert.equal(
    canStartOrder({ ordersEnabled: false, callerAllowed: true }),
    true,
  );
  assert.equal(
    canStartOrder({ ordersEnabled: true, callerAllowed: false }),
    true,
  );
  assert.equal(
    canStartOrder({ ordersEnabled: false, callerAllowed: false }),
    false,
  );
  assert.equal(canStartOrder(undefined), false);
});

test("malformed, missing and failed gates remain fail-closed", () => {
  for (const value of [null, {}, { ordersEnabled: false }, { callerAllowed: true }]) {
    assert.throws(() => parseOrderGate(value), /INVALID_ORDER_GATE/);
  }
  assert.deepEqual(
    parseOrderGate([{ ordersEnabled: false, callerAllowed: true }]),
    { ordersEnabled: false, callerAllowed: true },
  );
});

test("only the exact ORDERS_DISABLED message triggers the race fallback", () => {
  assert.equal(isOrdersDisabledError({ message: "ORDERS_DISABLED" }), true);
  assert.equal(isOrdersDisabledError({ message: "orders_disabled" }), false);
  assert.equal(isOrdersDisabledError(new Error("Teklif gönderilemedi")), false);
});

test("blocked-intent payload uses the frozen RPC parameter names", () => {
  assert.deepEqual(
    buildOrderIntentBlockedPayload(
      {
        surface: "recipe_product",
        listingId: "listing-1",
        recipeId: "recipe-1",
        crop: "domates",
      },
      "ios",
    ),
    {
      p_surface: "recipe_product",
      p_platform: "ios",
      p_listing_id: "listing-1",
      p_recipe_id: "recipe-1",
      p_crop: "domates",
    },
  );
  assert.deepEqual(
    buildOrderIntentBlockedPayload({ surface: "offer_route" }, "android"),
    { p_surface: "offer_route", p_platform: "android" },
  );
});

test("offer, counter-offer and payment CTAs are all gate-protected", async () => {
  const [product, orders, offer, card, gate] = await Promise.all([
    readFile(new URL("../app/product/[farmerId]/[crop].tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/orders.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/offer/[id].tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/hasat/OrdersComingSoonCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/hasat/orderGate.ts", import.meta.url), "utf8"),
  ]);

  assert.match(product, /orderGate\.canStartOrder && !runtimeBlocked/);
  assert.match(product, /orderGate\.isError/);
  assert.match(product, /isOrdersDisabledError\(e\)/);
  assert.match(product, /surface: "recipe_product"/);
  assert.match(product, /recipeId/);
  assert.match(orders, /canStartOrder=\{orderGate\.canStartOrder\}/);
  assert.match(offer, /orderGate\.canStartOrder \?/);
  assert.match(card, /Siparişler çok yakında/);
  assert.match(card, /accessible/);
  assert.match(gate, /retry: false/);
  assert.match(gate, /isSuccess && !query\.isFetching/);
  assert.match(gate, /sent\.current = true/);
});

test("Talep Et and UX-1F OFF paths stay outside the gate change", async () => {
  const [product, recipe] = await Promise.all([
    readFile(new URL("../app/product/[farmerId]/[crop].tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/recipe/[slug].tsx", import.meta.url), "utf8"),
  ]);
  assert.match(product, /Bu ürünü talep et/);
  assert.match(recipe, /Talep Et →/);
  assert.doesNotMatch(recipe, /useOrderGate/);
});
