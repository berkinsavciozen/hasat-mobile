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
