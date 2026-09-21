import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [screen, mutations, containment] = await Promise.all([
  readFile(new URL("../app/import.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/hasat/privateRecipeMutations.ts", import.meta.url), "utf8"),
  readFile(new URL("../tests/privateStepPhotoContainment.test.mjs", import.meta.url), "utf8"),
]);

test("ilk yüzey teknik AI seçenekleri yerine üç kullanıcı niyeti gösterir", () => {
  assert.match(screen, /Fotoğraf ekle/);
  assert.match(screen, /Tarif metni yapıştır/);
  assert.doesNotMatch(screen, /Metin veya bağlantı yapıştır/);
  assert.match(screen, /Sıfırdan tarif oluştur/);
  assert.doesNotMatch(screen, /Yemek Fotoğrafı Çek \(Tahmin Et\)/);
  assert.doesNotMatch(screen, /Galeriden Seç \(Tahmin Et\)/);
});

test("tek görsel seçiminden sonra yalnız belirsizlik fallback'i gösterilir", () => {
  assert.match(screen, /type Stage = .*"image-intent"/);
  assert.match(screen, /Bu görselde ne var\?/);
  assert.match(screen, /Yemek fotoğrafı/);
  assert.match(screen, /Yazılı tarif görseli/);
  assert.match(screen, /setPendingImage/);
});

test("manuel tarif UX-1B private create sözleşmesini tüketir", () => {
  assert.match(mutations, /rpc_create_private_recipe/);
  assert.match(mutations, /p_operation_type: "create_manual"/);
  assert.doesNotMatch(mutations, /visibility\s*:/);
  assert.doesNotMatch(mutations, /status\s*:/);
  assert.doesNotMatch(mutations, /owner_id\s*:/);
});

test("UX-1C-0 containment testi korunur", () => {
  assert.match(containment, /recipe-step-photos/);
  assert.doesNotMatch(screen, /uploadStepPhoto|pickStepPhoto|uploadingStepKey/);
});
