// T7a — "Fotoğraftan tarif tahmin et" (bitmiş/pişmiş yemek fotoğrafı -> AI
// TAHMİNİ taslak). `import.ts`'in ikiz kardeşi: aynı çağrı/hata çevirme deseni,
// FARKLI edge function (`estimate-recipe-from-photo`, canlıda — bkz. o
// fonksiyonun başlık yorumu: bu, extract-recipe'in "okuma"sından farklı bir
// "TAHMİN", bu yüzden sunucu her zaman sabit bir `disclaimer` + olası
// `uncertain_notes` döndürüyor). Kaydedilen taslak da diğer AI importları gibi
// `visibility='private'/status='draft'` SUNUCUDA zorlanıyor — burada da yeni
// bir çıkarım mantığı YOK, yalnızca çağrı + taslağa çevirme.
//
// KRİTİK UI KURALI (dispatch — Berkin'in onayı, kural #107 sorusu): dönen
// `disclaimer` sonuç ekranında BELİRGİN gösterilmek ZORUNDA, küçük bir dipnot
// değil — bkz. app/import.tsx review aşamasındaki banner. Bu dosya yalnızca
// veriyi taşır, banner'ı çizmez.
import { supabase } from "@/lib/supabase/client";

export class PhotoEstimateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PhotoEstimateError";
  }
}

function messageForCode(code: string, reason?: string | null): string {
  switch (code) {
    case "quota_exceeded":
      return "Bu ayki AI tarif tahmini hakkın doldu. Hakkın ayın başında yenilenir; o zamana kadar tarifi elle de ekleyebilirsin.";
    case "not_a_recipe":
      return reason
        ? `Bu fotoğrafta pişmiş bir yemek bulamadık (${reason}). Hazır/pişmiş bir yemeğin net bir fotoğrafını dener misin?`
        : "Bu fotoğrafta pişmiş bir yemek bulamadık. Hazır/pişmiş bir yemeğin net bir fotoğrafını dener misin?";
    case "image_required":
      return "Fotoğraf okunamadı, tekrar dener misin?";
    case "image_too_large":
      return "Fotoğraf çok büyük. Daha yakından, tek tabağı içeren bir kare dener misin?";
    case "credits_exhausted":
      return "AI servisi şu anda kullanılamıyor. Biraz sonra tekrar dene.";
    case "rate_limited":
      return "Çok fazla istek gönderildi. Birkaç dakika sonra tekrar dene.";
    case "ai_unreachable":
    case "ai_error":
    case "ai_bad_output":
      return "Tarif tahmin edilemedi. Biraz sonra tekrar dener misin?";
    case "unauthorized":
      return "Bu özelliği kullanmak için giriş yapmalısın.";
    case "insert_failed":
    case "quota_check_failed":
      return "Tarif kaydedilemedi. Biraz sonra tekrar dene.";
    case "offline":
      return "Fotoğraftan tahmin için internet bağlantısı gerekiyor.";
    default:
      return "Tarif tahmin edilemedi. Biraz sonra tekrar dener misin?";
  }
}

export interface PhotoEstimateResult {
  recipeId: string;
  title: string;
  extractionConfidence: number | null;
  ingredientCount: number;
  stepCount: number;
  cropLinkedCount: number;
  /** Sunucuda modelin ürettiği, kesin olmayan malzeme/pişirme notları. */
  uncertainNotes: string[];
  /** Sunucuda sabitlenmiş, modele bağlı olmayan uyarı metni — bkz. dosya başı. */
  disclaimer: string;
}

export async function estimateRecipeFromPhoto(input: {
  imageBase64: string;
  imageMime?: string;
  recipeName?: string;
}): Promise<PhotoEstimateResult> {
  const { data, error } = await supabase.functions.invoke("estimate-recipe-from-photo", {
    body: {
      image_base64: input.imageBase64,
      image_mime: input.imageMime,
      recipe_name: input.recipeName || undefined,
    },
  });

  if (error) {
    let code = "unknown";
    let reason: string | null = null;
    const ctx = (error as { context?: unknown }).context as
      | { json?: () => Promise<{ error?: string; reason?: string }> }
      | undefined;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) code = parsed.error;
        if (parsed?.reason) reason = parsed.reason;
      } catch {
        /* gövde okunamadıysa genel mesaja düşülür */
      }
    }
    throw new PhotoEstimateError(code, messageForCode(code, reason));
  }

  const payload = data as {
    recipe?: { id: string; title: string; extraction_confidence: number | string | null };
    ingredient_count?: number;
    step_count?: number;
    crop_linked_count?: number;
    uncertain_notes?: string[];
    disclaimer?: string;
  };
  if (!payload?.recipe?.id || !payload.disclaimer) {
    throw new PhotoEstimateError("ai_bad_output", messageForCode("ai_bad_output"));
  }

  const rawConfidence = payload.recipe.extraction_confidence;
  return {
    recipeId: payload.recipe.id,
    title: payload.recipe.title,
    extractionConfidence: rawConfidence == null ? null : Number(rawConfidence),
    ingredientCount: payload.ingredient_count ?? 0,
    stepCount: payload.step_count ?? 0,
    cropLinkedCount: payload.crop_linked_count ?? 0,
    uncertainNotes: Array.isArray(payload.uncertain_notes) ? payload.uncertain_notes : [],
    disclaimer: payload.disclaimer,
  };
}
