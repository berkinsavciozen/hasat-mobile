import assert from "node:assert/strict";
import test from "node:test";

import {
  convertRequestQuantity,
  normalizeRequestUnit,
  validateMobileCropRequest,
} from "../.test-build/hasat/requestForm.js";

test("mobile request form normalizes units and validates intentional quantity", () => {
  assert.equal(normalizeRequestUnit("g"), "g");
  assert.equal(normalizeRequestUnit("adet"), "kg");
  assert.equal(validateMobileCropRequest({ cropName: "Safran", quantity: "2,5" }), null);
  assert.match(validateMobileCropRequest({ cropName: " ", quantity: "2" }), /ürünü yazın/i);
  assert.match(validateMobileCropRequest({ cropName: "Safran", quantity: "0" }), /miktar/i);
});

test("mobile request quantity converts g and kg without inventing volume conversions", () => {
  assert.deepEqual(convertRequestQuantity("2500", "g", "kg"), {
    quantityText: "2.5",
    converted: true,
  });
  assert.deepEqual(convertRequestQuantity("2.5", "kg", "g"), {
    quantityText: "2500",
    converted: true,
  });
  assert.deepEqual(convertRequestQuantity("2.5", "kg", "L"), {
    quantityText: "2.5",
    converted: false,
  });
});
