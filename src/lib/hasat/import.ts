// P23-M6 — AI tarif içe aktarma (metin + YAZILI tarif fotoğrafı).
//
// KRİTİK KAPSAM KURALI: burada YENİ ÇIKARIM MANTIĞI YOK. Çıkarımın tamamı
// M2'de deploy edilmiş `extract-recipe` edge function'ında yaşıyor
// (`verify_jwt` açık, kota `ai_usage_tracking` ile, `visibility='private'` +
// `author_type='kullanici'` + `owner_id` SUNUCUDA zorlanıyor, client'ın
// gönderdiği değerlere bakılmıyor). Bu dosya yalnızca:
//   1. o fonksiyonu çağırır,
//   2. hataları kullanıcı diline çevirir,
//   3. çıkan TASLAĞI düzenlenebilir hale getirir (yükle/kaydet/sil).
//
// Neden "önce kaydedilir, sonra düzenlenir": edge function kontratı gereği
// çıkarım sonucu doğrudan `recipes`/`recipe_steps`/`recipe_ingredients`'a
// `status='draft'`, `visibility='private'` olarak yazılıyor — fonksiyona
// dokunmadan (görev metni: "yeni bir çıkarım mantığı yazma") bunu "önce
// göster, sonra yaz"a çeviremeyiz. Sonuç kullanıcı için aynı: kaydedilen şey
// kişisel deftere düşen bir TASLAK, kullanıcı onaylamadan hiçbir yere
// (public korpusa asla) gitmiyor, "Vazgeç" derse taslak siliniyor.
import { supabase } from "@/lib/supabase/client";

/** Şartnamedeki eşik (P23-Mobile-Visual-Spec.md → "3c"): altındaysa kullanıcıya
 * "emin değiliz, kontrol et" uyarısı gösterilir, alan BLOKLANMAZ. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export type ImportMode = "text" | "photo";

export class ImportError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ImportError";
  }
}

function messageForCode(code: string): string {
  switch (code) {
    case "quota_exceeded":
      // Görev metni: kota aşımında anlaşılır mesaj (gerçek 429 ile doğrulandı).
      return "Bu ayki AI tarif çıkarma hakkın doldu. Hakkın ayın başında yenilenir; o zamana kadar tarifi elle de ekleyebilirsin.";
    case "not_a_recipe":
      return "Gönderdiğinde bir tarif bulamadık. Yazılı bir tarif metni ya da tarif sayfasının net bir fotoğrafını dene.";
    case "text_too_short":
      return "Metin çok kısa — malzemeleri ve adımları da yapıştır.";
    case "text_too_long":
      return "Metin çok uzun. Yalnızca tarifin kendisini yapıştır.";
    case "image_required":
      return "Fotoğraf okunamadı, tekrar dener misin?";
    case "image_too_large":
      return "Fotoğraf çok büyük. Daha yakından, tek sayfayı içeren bir kare çek.";
    case "credits_exhausted":
      return "AI servisi şu anda kullanılamıyor. Biraz sonra tekrar dene.";
    case "rate_limited":
      return "Çok fazla istek gönderildi. Birkaç dakika sonra tekrar dene.";
    case "ai_unreachable":
    case "ai_error":
    case "ai_bad_output":
      return "Tarif okunamadı. Biraz sonra tekrar dener misin?";
    case "unauthorized":
      return "Tarif eklemek için giriş yapmalısın.";
    case "invalid_mode":
      return "Bu içerik türü henüz desteklenmiyor.";
    case "insert_failed":
    case "quota_check_failed":
      return "Tarif kaydedilemedi. Biraz sonra tekrar dene.";
    case "offline":
      return "Tarif çıkarma için internet bağlantısı gerekiyor.";
    default:
      return "Tarif okunamadı. Biraz sonra tekrar dener misin?";
  }
}

export interface ExtractionResult {
  recipeId: string;
  title: string;
  extractionConfidence: number | null;
  ingredientCount: number;
  stepCount: number;
  cropLinkedCount: number;
}

export async function extractRecipe(input: {
  mode: ImportMode;
  text?: string;
  imageBase64?: string;
  imageMime?: string;
  /** P23-M6-ek: kullanıcının tarifin orijinal adı için verdiği ipucu.
   * KESİN SINIR: yalnızca extract-recipe'in OCR/çıkarımını yönlendirmek için
   * kullanılır (bkz. edge function SYSTEM_PROMPT) — buradan title/adım/malzeme
   * uydurulmaz, sunucu tarafında da zorlanır. */
  recipeName?: string;
}): Promise<ExtractionResult> {
  const body =
    input.mode === "text"
      ? { mode: "text", text: input.text ?? "", recipe_name: input.recipeName || undefined }
      : {
          mode: "photo",
          image_base64: input.imageBase64 ?? "",
          image_mime: input.imageMime,
          recipe_name: input.recipeName || undefined,
        };

  const { data, error } = await supabase.functions.invoke("extract-recipe", { body });

  if (error) {
    let code = "unknown";
    const ctx = (error as { context?: unknown }).context as
      | { json?: () => Promise<{ error?: string }> }
      | undefined;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) code = parsed.error;
      } catch {
        /* gövde okunamadıysa genel mesaja düşülür */
      }
    }
    throw new ImportError(code, messageForCode(code));
  }

  const payload = data as {
    recipe?: { id: string; title: string; extraction_confidence: number | string | null };
    ingredient_count?: number;
    step_count?: number;
    crop_linked_count?: number;
  };
  if (!payload?.recipe?.id) throw new ImportError("ai_bad_output", messageForCode("ai_bad_output"));

  const rawConfidence = payload.recipe.extraction_confidence;
  return {
    recipeId: payload.recipe.id,
    title: payload.recipe.title,
    extractionConfidence: rawConfidence == null ? null : Number(rawConfidence),
    ingredientCount: payload.ingredient_count ?? 0,
    stepCount: payload.step_count ?? 0,
    cropLinkedCount: payload.crop_linked_count ?? 0,
  };
}

// ── Manuel crop eşleştirme seçici (P23-M6-ek) ───────────────────────────────
// crop_config'ten beslenir, is_edible=false crop'lar (pamuk, tütün,
// şeker_pancarı, safran_soğanı) hiç listeye girmez.
export interface CropOption {
  crop: string;
  displayName: string;
}

export async function loadEdibleCropOptions(): Promise<CropOption[]> {
  const { data: meta, error: metaErr } = await supabase
    .from("crop_culinary_meta")
    .select("crop")
    .eq("is_edible", true);
  if (metaErr) throw metaErr;
  const crops = (meta ?? []).map((m) => m.crop as string);
  if (crops.length === 0) return [];

  const { data: configs, error: cfgErr } = await supabase
    .from("crop_config")
    .select("crop, display_name")
    .in("crop", crops);
  if (cfgErr) throw cfgErr;

  return (configs ?? [])
    .map((c) => ({ crop: c.crop as string, displayName: (c.display_name as string) ?? c.crop }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
}

// ── Düzenlenebilir taslak ────────────────────────────────────────────────────

export type IngredientClass = "tarimsal" | "platform_disi";

export interface DraftIngredient {
  /** DB'deki mevcut satırın id'si; yeni eklenen (henüz kaydedilmemiş) satırda null. */
  id: string | null;
  key: string;
  name: string;
  quantity: string;
  unit: string;
  note: string | null;
  isKey: boolean;
  /** P23-M6-ek: extract-recipe'in deterministik trigger'ının (ya da kullanıcının
   * manuel seçiminin) bağladığı crop_config.crop. Kullanıcı değiştirebilir/kaldırabilir. */
  crop: string | null;
  /** P23-M6-ek: extract-recipe'in olgusal sınıflandırması, kullanıcı düzeltebilir. */
  ingredientClass: IngredientClass | null;
}

export interface DraftStep {
  key: string;
  instruction: string;
  /** Kullanıcıya dakika olarak gösteriliyor; DB'ye saniye yazılıyor. */
  timerMinutes: string;
}

export interface RecipeDraft {
  recipeId: string;
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  extractionConfidence: number | null;
  ingredients: DraftIngredient[];
  /** Yükleme anında DB'de var olan malzeme id'leri — saveDraft bunu güncel
   * `ingredients` listesiyle karşılaştırıp kullanıcının sildiği satırları bulur. */
  initialIngredientIds: string[];
  steps: DraftStep[];
}

let keySeq = 0;
export function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function numToStr(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

export async function loadDraft(recipeId: string): Promise<RecipeDraft> {
  const [{ data: recipe, error: rErr }, { data: steps, error: sErr }, { data: ings, error: iErr }] =
    await Promise.all([
      supabase
        .from("recipes")
        .select("id, title, servings, prep_minutes, cook_minutes, extraction_confidence")
        .eq("id", recipeId)
        .single(),
      supabase
        .from("recipe_steps")
        .select("id, step_no, instruction, timer_seconds")
        .eq("recipe_id", recipeId)
        .order("step_no", { ascending: true }),
      supabase
        .from("recipe_ingredients")
        .select("id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class")
        .eq("recipe_id", recipeId)
        .order("sort_order", { ascending: true }),
    ]);
  if (rErr) throw rErr;
  if (sErr) throw sErr;
  if (iErr) throw iErr;

  // P23-M6-ek: `ingredient_class` henüz hasat-core'un üretilmiş Database
  // tipinde yok (senkron PR'ı ayrı akar — kural #105/#111). Şema tarafında
  // kolon gerçekten var ve gerçek SQL ile doğrulandı (bkz. Build/DB-Schema.md);
  // burada yalnızca TS tipini geçici olarak genişletiyoruz.
  const ingsTyped = (ings ?? []) as unknown as Array<{
    id: string;
    free_text_name: string | null;
    quantity: number | null;
    unit: string | null;
    note: string | null;
    is_key_ingredient: boolean;
    crop: string | null;
    ingredient_class: IngredientClass | null;
  }>;

  return {
    recipeId,
    title: recipe.title ?? "",
    servings: numToStr(recipe.servings),
    prepMinutes: numToStr(recipe.prep_minutes),
    cookMinutes: numToStr(recipe.cook_minutes),
    extractionConfidence:
      recipe.extraction_confidence == null ? null : Number(recipe.extraction_confidence),
    ingredients: ingsTyped.map((i) => ({
      id: i.id,
      key: newKey("ing"),
      name: i.free_text_name ?? "",
      quantity: numToStr(i.quantity),
      unit: i.unit ?? "",
      note: i.note,
      isKey: !!i.is_key_ingredient,
      crop: i.crop ?? null,
      ingredientClass: i.ingredient_class ?? null,
    })),
    initialIngredientIds: ingsTyped.map((i) => i.id),
    steps: (steps ?? []).map((s) => ({
      key: newKey("step"),
      instruction: s.instruction ?? "",
      timerMinutes: s.timer_seconds == null ? "" : String(Math.round(s.timer_seconds / 60)),
    })),
  };
}

function parseIntOrNull(v: string): number | null {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseNumOrNull(v: string): number | null {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Kullanıcının düzelttiği taslağı yazar.
 *
 * Adım satırları hâlâ silinip yeniden yazılıyor (kısmi diff bu boyutta
 * gereksiz karmaşıklık — bkz. eski gerekçe).
 *
 * Malzeme satırları artık FARKLI: P23-M6-ek'te `recipe_ingredients` üzerine
 * bir BEFORE INSERT trigger (`trg_recipe_ingredients_auto_match_crop`) geldi.
 * Var olan satırları silip yeniden INSERT etmek, kullanıcının önizlemede
 * manuel olarak KALDIRDIĞI bir crop'un (metin aynı kaldığı için) trigger
 * tarafından sessizce yeniden bağlanmasına yol açardı — kullanıcının açık
 * "kaldır" kararı kalıcı olmazdı. Bu yüzden var olan satırlar artık UPDATE
 * ediliyor (trigger yalnızca INSERT'te çalışır, UPDATE'e karışmaz); yalnızca
 * gerçekten yeni eklenen satırlar INSERT ediliyor (crop boşsa trigger orada
 * deterministik eşleşmeyi dener — ilk import'takiyle aynı kural); kullanıcının
 * sildiği satırlar id ile DELETE ediliyor.
 * RLS bu yolların hepsinin yalnızca `owner_id = auth.uid()` için açık olduğunu
 * garanti ediyor (gerçek SQL ile doğrulandı — bkz. TODO.md → P23-M6-ek).
 */
export async function saveDraft(draft: RecipeDraft): Promise<void> {
  const { error: rErr } = await supabase
    .from("recipes")
    .update({
      title: draft.title.trim() || "Adsız tarif",
      servings: parseIntOrNull(draft.servings),
      prep_minutes: parseIntOrNull(draft.prepMinutes),
      cook_minutes: parseIntOrNull(draft.cookMinutes),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draft.recipeId);
  if (rErr) throw rErr;

  const keptIngredients = draft.ingredients.filter((i) => i.name.trim());
  const keptIds = new Set(keptIngredients.filter((i) => i.id).map((i) => i.id as string));
  const removedIds = draft.initialIngredientIds.filter((id) => !keptIds.has(id));

  if (removedIds.length > 0) {
    const { error } = await supabase.from("recipe_ingredients").delete().in("id", removedIds);
    if (error) throw error;
  }

  const existingRows = keptIngredients.filter((i) => i.id);
  const newRows = keptIngredients.filter((i) => !i.id);

  // P23-M6-ek: `ingredient_class` henüz hasat-core'un üretilmiş Database
  // tipinde yok (senkron PR'ı ayrı akar — kural #105/#111); şemada gerçekten
  // var ve gerçek SQL ile doğrulandı (bkz. Build/DB-Schema.md). Update/insert
  // payload'ları bu yüzden `as any` ile geçiyor — yalnızca bu iki çağrı.
  for (const [idx, ing] of existingRows.entries()) {
    const { error } = await supabase
      .from("recipe_ingredients")
      .update({
        sort_order: idx + 1,
        crop: ing.crop,
        free_text_name: ing.name.trim(),
        quantity: parseNumOrNull(ing.quantity),
        unit: ing.unit.trim() || null,
        note: ing.note,
        is_key_ingredient: ing.isKey,
        ingredient_class: ing.ingredientClass,
      } as any)
      .eq("id", ing.id as string);
    if (error) throw error;
  }

  if (newRows.length > 0) {
    const { error } = await supabase.from("recipe_ingredients").insert(
      newRows.map((ing, idx) => ({
        recipe_id: draft.recipeId,
        sort_order: existingRows.length + idx + 1,
        crop: ing.crop,
        free_text_name: ing.name.trim(),
        quantity: parseNumOrNull(ing.quantity),
        unit: ing.unit.trim() || null,
        note: ing.note,
        is_key_ingredient: ing.isKey,
        ingredient_class: ing.ingredientClass,
      })) as any,
    );
    if (error) throw error;
  }

  const steps = draft.steps
    .filter((s) => s.instruction.trim())
    .map((s, idx) => {
      const minutes = parseIntOrNull(s.timerMinutes);
      return {
        recipe_id: draft.recipeId,
        step_no: idx + 1,
        instruction: s.instruction.trim(),
        timer_seconds: minutes == null ? null : minutes * 60,
      };
    });

  const { error: delStepErr } = await supabase
    .from("recipe_steps")
    .delete()
    .eq("recipe_id", draft.recipeId);
  if (delStepErr) throw delStepErr;
  if (steps.length > 0) {
    const { error } = await supabase.from("recipe_steps").insert(steps);
    if (error) throw error;
  }
}

/** Kullanıcı "Vazgeç" derse taslak tamamen silinir (adım/malzeme FK cascade). */
export async function discardDraft(recipeId: string): Promise<void> {
  const { error } = await supabase.from("recipes").delete().eq("id", recipeId);
  if (error) throw error;
}
