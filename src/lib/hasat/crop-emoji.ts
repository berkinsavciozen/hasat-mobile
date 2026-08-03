// Web'in `crop-config.ts` → `CROP_EMOJI_OVERRIDES`'ın 18 tariflik odak crop
// listesine indirgenmiş kopyası (bkz. format.ts'teki aynı kopyalama notu).
// `rpc_recipe_availability.crop_photo_url` doluysa bu hiç kullanılmaz — bu
// yalnızca fotoğraf yokken (crop_config.default_photo_url de boşsa) veya
// veri henüz yüklenmemişken gösterilen bir simge yedeğidir.
const CROP_EMOJI_OVERRIDES: Record<string, string> = {
  safran: "🌸",
  zeytinyağı: "🫒",
  zeytin: "🫒",
  üzüm: "🍇",
  fındık: "🌰",
  ceviz: "🌰",
  badem: "🌰",
  buğday: "🌾",
  domates: "🍅",
  biber: "🌶️",
  patlıcan: "🍆",
  incir: "🍇",
  elma: "🍎",
  nane: "🌿",
  kekik: "🌿",
  nohut: "🫘",
  mercimek: "🫘",
};

export function cropEmoji(crop: string | null | undefined): string {
  if (!crop) return "🌾";
  return CROP_EMOJI_OVERRIDES[crop.toLocaleLowerCase("tr-TR")] ?? "🌾";
}
