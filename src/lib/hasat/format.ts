// Web'in `src/lib/hasat/format.ts` ve `crop-config.ts`'inden gereken en küçük
// alt küme — birebir aynı mantık (Türkçe-duyarlı casing, aynı emoji harita).
// Bilinçli kopya: Shared-Architecture.md → "Katman 2" bu dosyaların
// `hasat-core`'a taşınmasını M5-b/M9'a aday olarak listeliyor ama ilk turu
// küçük tutmak için erteliyor (web'de 33 dosya import ediyor, taşımak o
// dosyalara dokunmak demek — kapsam dışı, "web reposu" dokunulmaz listesinde).
// Bu yüzden burada birebir küçük bir kopya var, `hasat-core`'a taşınmadı.

const TRY_FORMATTER = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

export function formatTRY(n: number): string {
  return TRY_FORMATTER.format(n);
}

// Web'in aynı adlı fonksiyonunun birebir kopyası (bkz. dosya başı notu) —
// birime göre makul ondalık basamak, IEEE754 float artığını (ör.
// `base - reserved` → 59.599999999999994) ekranda temizler (P23-M7-g).
const QUANTITY_FRACTION_DIGITS: Record<string, number> = {
  g: 1,
  kg: 2,
  L: 2,
  adet: 0,
};
const QUANTITY_FORMATTERS = new Map<number, Intl.NumberFormat>();

function quantityFormatter(maximumFractionDigits: number): Intl.NumberFormat {
  let f = QUANTITY_FORMATTERS.get(maximumFractionDigits);
  if (!f) {
    f = new Intl.NumberFormat("tr-TR", { maximumFractionDigits });
    QUANTITY_FORMATTERS.set(maximumFractionDigits, f);
  }
  return f;
}

export function formatQuantity(qty: number | null | undefined, unit: string | null | undefined): string {
  if (qty == null || !Number.isFinite(qty)) return qty == null ? "" : String(qty);
  const digits = QUANTITY_FRACTION_DIGITS[unit ?? ""] ?? 2;
  return quantityFormatter(digits).format(qty);
}

/** "1 bardak ceviz" gibi cümle-içi kullanım için küçük harf crop adı. */
export function formatCropIngredient(slug: string | null | undefined): string {
  if (!slug) return "—";
  return String(slug)
    .split("_")
    .map((w) => w.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean)
    .join(" ");
}

/** Malzeme kartındaki isim: `rpc_recipe_availability.crop_display_name`
 * kanonik gösterim adı (slug'dan türetilmiş tahmin değil, gerçek isim) —
 * mevcutsa o kullanılır, M4-b'nin küçük-harf kararına uyarak küçük harfe
 * çevrilir (cümle-içi kullanım, liste öğesi başı değil). `availability`
 * canlı veri olduğundan offline'da hiç çağrılmaz (bkz. offline/db.ts) — o
 * durumda `cropDisplayName` her zaman undefined gelir ve slug fallback'i
 * (`formatCropIngredient`) devreye girer. */
export function formatIngredientName(
  crop: string | null | undefined,
  cropDisplayName: string | null | undefined,
  freeTextName: string | null | undefined,
): string {
  if (cropDisplayName) return cropDisplayName.toLocaleLowerCase("tr-TR");
  if (crop) return formatCropIngredient(crop);
  return freeTextName ?? "";
}

// DQ-2 — tarif malzeme birimi gösterimi. DB'de birim bilerek karışık
// saklanıyor: pipeline ASCII slug yazıyor (`su_bardagi`), eski tarifler
// Türkçe metin (`su bardağı`). İkisi de geçerli; bu fonksiyon yalnızca OKUMA
// görünümleri içindir. Düzenleme input'larının değeri ve `formatQuantity`'nin
// ondalık kuralı ham birimle çalışmaya devam eder. Web'deki eşleme ile aynı.
const INGREDIENT_UNIT_LABELS: Record<string, string> = {
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

export function formatIngredientUnit(unit: string | null | undefined): string {
  if (unit == null) return "";
  return INGREDIENT_UNIT_LABELS[unit] ?? unit.replace(/_/g, " ");
}

// DQ-2 — miktarsız malzemelerin (tuz, karabiber, servis yeşilliği...) boş
// görünmemesi için `recipe_ingredients.nutrition_exclusion_reason`'dan metin.
// Bilinmeyen/null neden → "" (eski önbellek satırlarında kolon null).
// Not zaten aynı şeyi söylüyorsa ("damak tadına göre", "zevkinize göre")
// etiket tekrarlanmaz — satırda yalnız not görünür.
const UNQUANTIFIED_LABELS: Record<string, string> = {
  seasoning_to_taste_unquantified: "damak tadına göre",
  serving_only_unquantified: "servis için",
  trace_flavoring_unquantified: "bir miktar",
};

const NOTE_ALREADY_SAYS_TO_TASTE = /damak|tadına|zevkine/;

export function formatUnquantifiedIngredient(
  reason: string | null | undefined,
  note?: string | null,
): string {
  const label = (reason && UNQUANTIFIED_LABELS[reason]) || "";
  if (label && note && NOTE_ALREADY_SAYS_TO_TASTE.test(note.toLocaleLowerCase("tr-TR"))) return "";
  return label;
}

/** DQ-2 — kare (1:1) kapak varyantı. Detay hero'su 4:3 kırptığı için bu
 * kapaklar `contain` + bulanık arka planla gösterilir; 16:9 kapaklar
 * etkilenmez. Sorgu dizesi/fragment varsa yok sayılır. */
export function isSquareCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /-1x1\.webp$/i.test(url.split(/[?#]/)[0]);
}
