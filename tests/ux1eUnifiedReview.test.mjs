import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [detail, customize, importer, shell, home, containment] = await Promise.all([
  readFile(new URL("../app/recipe/[slug].tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/recipe-customize.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/import.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/hasat/RecipeReviewShell.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/home.tsx", import.meta.url), "utf8"),
  readFile(new URL("./privateStepPhotoContainment.test.mjs", import.meta.url), "utf8"),
]);

test("public tarif karar yüzeyi tek baskın CTA ve ikincil birebir kopya sunar", () => {
  assert.match(detail, />Kendime göre uyarla</);
  assert.match(detail, /bg-saffron/);
  assert.match(detail, /Olduğu gibi Defterime ekle/);
  assert.doesNotMatch(detail, /AI ile Özelleştir/);
  assert.doesNotMatch(detail, /Bağımsız Klonla/);
  assert.match(detail, /accessibilityHint="AI kullanmadan birebir özel kopya oluşturur"/);
});

test("T6 ve clone başarıları ikinci review yerine Defterim'e gider", () => {
  for (const source of [detail, customize]) {
    assert.match(source, /invalidateQueries\(\{ queryKey: MY_RECIPES_QUERY_KEY \}\)/);
    assert.match(source, /router\.replace\(\{ pathname: "\/home", params: \{ tab: "mine" \} \}\)/);
  }
  assert.doesNotMatch(customize, /pathname: "\/import"/);
  assert.doesNotMatch(detail, /pathname: "\/import", params: \{ recipeId: result\.recipeId/);
  assert.match(home, /requestedTab === "mine" \? "mine" : "public"/);
});

test("ortak review kabuğu import, T7a ve T6 tarafından paylaşılır", () => {
  assert.match(importer, /<RecipeReviewShell/);
  assert.match(customize, /<RecipeReviewShell/);
  assert.match(shell, /accessibilityState=\{\{ disabled, busy: saving \}\}/);
  assert.match(shell, /paddingBottom: insets\.bottom \+ 40/);
});

test("T7a güçlü tahmin uyarısı ve UX-1C containment korunur", () => {
  assert.match(importer, /border-2 border-gold bg-gold\/25/);
  assert.match(importer, /estimateMeta\.disclaimer/);
  assert.match(importer, /Emin olunamayan noktalar/);
  assert.match(containment, /recipe-step-photos/);
  assert.doesNotMatch(importer, /uploadStepPhoto|pickStepPhoto|uploadingStepKey/);
});

test("offline, loading, retry ve iptal durumları açık; girdiler korunur", () => {
  assert.match(customize, /Çevrimdışısın\. Yazdıkların korunuyor/);
  assert.match(customize, /İstek iptal edildi\. Yazdıkların korundu/);
  assert.match(customize, /requestSequence\.current \+= 1/);
  assert.match(detail, /Seçimin ve tekrar deneme anahtarın korundu/);
  assert.match(detail, /accessibilityState=\{\{ disabled: busy \|\| isOffline, busy \}\}/);
});

test("private-only sınırı UI metni ve yayın CTA yokluğuyla korunur", () => {
  assert.match(detail, /herkese açık hâli değişmez/);
  assert.match(detail, /yalnızca senin Defterim'de görünür/);
  assert.doesNotMatch(detail, />Yayınla</);
  assert.doesNotMatch(detail, /herkese açık yap/i);
  assert.match(customize, /yalnızca sana görünen ayrı bir taslak/);
});
