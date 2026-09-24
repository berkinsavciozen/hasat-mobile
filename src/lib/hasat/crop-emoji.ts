// Web'in `crop-config.ts` → `CROP_EMOJI_OVERRIDES`'ının mobil kopyası (bkz.
// format.ts'teki aynı kopyalama notu). `rpc_recipe_availability.crop_photo_url`
// doluysa bu hiç kullanılmaz — bu yalnızca fotoğraf yokken (crop_config.
// default_photo_url de boşsa) veya veri henüz yüklenmemişken gösterilen bir
// simge yedeğidir.
//
// DQ-2: tablo ürüne bağlı olmayan (serbest metin) malzemeleri de kapsıyor —
// su, tuz, şeker gibi. 🌾 yalnızca tahıllar (buğday/arpa) için; eşleşmeyen
// her şey nötr ikona düşer, "ürün" imajı vermez.
const CROP_EMOJI_OVERRIDES: Record<string, string> = {
  safran: "🌸",
  zeytinyağı: "🫒",
  zeytin: "🫒",
  üzüm: "🍇",
  fındık: "🌰",
  ceviz: "🌰",
  badem: "🌰",
  buğday: "🌾",
  arpa: "🌾",
  pirinç: "🍚",
  domates: "🍅",
  biber: "🌶️",
  patlıcan: "🍆",
  incir: "🍇",
  elma: "🍎",
  nar: "🍎",
  ayva: "🍐",
  portakal: "🍊",
  mandalina: "🍊",
  greyfurt: "🍊",
  limon: "🍋",
  muz: "🍌",
  kabak: "🥒",
  salatalık: "🥒",
  patates: "🥔",
  soğan: "🧅",
  sarımsak: "🧄",
  havuç: "🥕",
  zencefil: "🫚",
  nane: "🌿",
  kekik: "🌿",
  nohut: "🫘",
  mercimek: "🫘",
  şeker: "🍬",
  tuz: "🧂",
  su: "💧",
  süt: "🥛",
  yumurta: "🥚",
  tereyağı: "🧈",
  bal: "🍯",
};

export const NEUTRAL_INGREDIENT_EMOJI = "🥄";

function lookup(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  return CROP_EMOJI_OVERRIDES[name.trim().toLocaleLowerCase("tr-TR")];
}

export function cropEmoji(
  crop: string | null | undefined,
  freeTextName?: string | null,
): string {
  return lookup(crop) ?? lookup(freeTextName) ?? NEUTRAL_INGREDIENT_EMOJI;
}
