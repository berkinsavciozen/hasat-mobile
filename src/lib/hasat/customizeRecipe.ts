// T6 — "AI ile özelleştir" (Faz A öneri + Faz B kaydetme).
// Backend: `customize-recipe` edge function (Faz A, phase="propose") +
// `rpc_create_ai_customized_recipe` RPC (Faz B, kullanıcı onaylayınca gerçek
// kayıt) — 2026-09-10'da ACCEPTED/merge edildi, canlıda. Kontrat:
// hasat-vault/Build/T6-Backend-Clone-Save-Contract.md +
// hasat-core migration 20260910085958_t6_ai_customize_recipe_contract.sql.
//
// Faz B'nin edge function'ın kendi "save" dalını DEĞİL doğrudan RPC'yi
// çağırması bilinçli: dispatch'in kanonik akışı böyle tarif ediyor (Faz A
// edge function, Faz B doğrudan RPC) ve F11 (rpc_clone_recipe) ile aynı
// desen — istemci `supabase.rpc(...)` çağırıyor, kendi JWT'siyle
// (auth.uid()) SECURITY INVOKER RPC'yi tetikliyor.
//
// idempotency_key: Faz A ve Faz B'de AYNI değer kullanılmalı (RPC bunu
// `ai_customize_requests` üzerinden retry-safe yapıyor — bkz. migration).
// Client bir kere üretir (`newIdempotencyKey`), ekran state'inde tutar.
import { supabase } from "@/lib/supabase/client";
import { uuidv4 } from "@/lib/hasat/uuid";

export class CustomizeRecipeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CustomizeRecipeError";
  }
}

function messageForCode(code: string): string {
  switch (code) {
    case "quota_exceeded":
      return "Bu ayki AI kullanım hakkın doldu. Hakkın ayın başında yenilenir.";
    case "instruction_required":
      return "Ne değiştirmek istediğini biraz daha ayrıntılı yazar mısın?";
    case "source_not_eligible":
      return "Bu tarif AI ile özelleştirmeye uygun değil.";
    case "source_not_found":
      return "Kaynak tarif bulunamadı.";
    case "idempotency_key_conflict":
      return "Bu işlem başka bir oturumda zaten kullanılmış. Ekranı kapatıp tekrar dener misin?";
    case "credits_exhausted":
      return "AI servisi şu anda kullanılamıyor. Biraz sonra tekrar dene.";
    case "rate_limited":
      return "Çok fazla istek gönderildi. Birkaç dakika sonra tekrar dene.";
    case "ai_unreachable":
    case "ai_error":
    case "ai_bad_output":
      return "Öneri üretilemedi. Biraz sonra tekrar dener misin?";
    case "unauthorized":
      return "Bu özelliği kullanmak için giriş yapmalısın.";
    case "ingredients_required":
    case "steps_required":
    case "title_required":
      return "Öneri eksik göründü, tekrar dener misin?";
    case "save_failed":
    case "quota_check_failed":
    case "request_log_failed":
      return "Kaydedilemedi. Biraz sonra tekrar dene.";
    default:
      return "Bir şeyler ters gitti. Tekrar dener misin?";
  }
}

export function newIdempotencyKey(): string {
  return uuidv4();
}

export interface CustomizeDraftIngredient {
  crop: string | null;
  freeTextName: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  isKeyIngredient: boolean;
  sortOrder: number;
}

export interface CustomizeDraftStep {
  stepNo: number;
  instruction: string;
  timerSeconds: number | null;
}

export interface CustomizeDraft {
  title: string;
  description: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  restMinutes: number | null;
  difficulty: "kolay" | "orta" | "zor" | null;
  ingredients: CustomizeDraftIngredient[];
  steps: CustomizeDraftStep[];
}

export interface ProposeResult {
  idempotencyKey: string;
  sourceRecipeId: string;
  draft: CustomizeDraft;
  changedFields: string[];
  valid: boolean;
  issues: unknown[];
}

function normalizeDraft(raw: any): CustomizeDraft {
  return {
    title: typeof raw?.title === "string" ? raw.title : "",
    description: typeof raw?.description === "string" ? raw.description : null,
    servings: typeof raw?.servings === "number" ? raw.servings : null,
    prepMinutes: typeof raw?.prepMinutes === "number" ? raw.prepMinutes : null,
    cookMinutes: typeof raw?.cookMinutes === "number" ? raw.cookMinutes : null,
    restMinutes: typeof raw?.restMinutes === "number" ? raw.restMinutes : null,
    difficulty: ["kolay", "orta", "zor"].includes(raw?.difficulty) ? raw.difficulty : null,
    ingredients: Array.isArray(raw?.ingredients)
      ? raw.ingredients.map((ing: any, i: number) => ({
          crop: typeof ing?.crop === "string" ? ing.crop : null,
          freeTextName: typeof ing?.freeTextName === "string" ? ing.freeTextName : null,
          quantity: typeof ing?.quantity === "number" ? ing.quantity : null,
          unit: typeof ing?.unit === "string" ? ing.unit : null,
          note: typeof ing?.note === "string" ? ing.note : null,
          isKeyIngredient: ing?.isKeyIngredient === true,
          sortOrder: typeof ing?.sortOrder === "number" ? ing.sortOrder : i,
        }))
      : [],
    steps: Array.isArray(raw?.steps)
      ? raw.steps.map((s: any, i: number) => ({
          stepNo: typeof s?.stepNo === "number" ? s.stepNo : i + 1,
          instruction: typeof s?.instruction === "string" ? s.instruction : "",
          timerSeconds: typeof s?.timerSeconds === "number" ? s.timerSeconds : null,
        }))
      : [],
  };
}

/** `error.context`'te JSON gövde bulunabiliyorsa (Faz A'nın 422 doğrulama-
 * başarısız yanıtı gibi, hâlâ bir `draft` taşıyabilir) onu döndürür; hiçbiri
 * yoksa yalnızca `errorCode` taşıyan minimal bir gövdeye düşer. */
async function resolveInvokeError(error: unknown): Promise<any> {
  const ctx = (error as { context?: unknown }).context as
    | { json?: () => Promise<any> }
    | undefined;
  if (ctx && typeof ctx.json === "function") {
    try {
      const parsed = await ctx.json();
      if (parsed && typeof parsed === "object") return { ...parsed, errorCode: parsed.error };
    } catch {
      /* gövde okunamadı */
    }
  }
  return { errorCode: "unknown" };
}

export async function proposeCustomization(input: {
  sourceRecipeId: string;
  instruction: string;
  idempotencyKey: string;
}): Promise<ProposeResult> {
  const { data, error } = await supabase.functions.invoke("customize-recipe", {
    body: {
      phase: "propose",
      source_recipe_id: input.sourceRecipeId,
      instruction: input.instruction,
      idempotency_key: input.idempotencyKey,
    },
  });

  const payload = error ? await resolveInvokeError(error) : data;
  if (!payload?.draft) {
    const code = payload?.errorCode ?? "unknown";
    throw new CustomizeRecipeError(code, messageForCode(code));
  }

  return {
    idempotencyKey: payload.idempotency_key ?? input.idempotencyKey,
    sourceRecipeId: payload.source_recipe_id ?? input.sourceRecipeId,
    draft: normalizeDraft(payload.draft),
    changedFields: Array.isArray(payload.changedFields) ? payload.changedFields : [],
    valid: payload.validation?.valid === true,
    issues: Array.isArray(payload.validation?.issues) ? payload.validation.issues : [],
  };
}

export async function saveCustomization(input: {
  idempotencyKey: string;
  sourceRecipeId: string;
  draft: CustomizeDraft;
}): Promise<string> {
  // `rpc_create_ai_customized_recipe` bugünkü migration'la geldi, hasat-core'un
  // üretilmiş Database tipinde henüz yok (senkron PR'ı ayrı akar — kural
  // #105/#111, bkz. import.ts'teki `ingredient_class` ile aynı gerekçe).
  // Fonksiyon adı ve imza gerçek SQL ile doğrulandı (Supabase MCP,
  // pg_get_functiondef) — bu yüzden yalnızca bu çağrı `as any` ile geçiyor.
  const { data, error } = await (supabase.rpc as any)("rpc_create_ai_customized_recipe", {
    p_idempotency_key: input.idempotencyKey,
    p_source_recipe_id: input.sourceRecipeId,
    p_title: input.draft.title,
    p_description: input.draft.description,
    p_servings: input.draft.servings,
    p_prep_minutes: input.draft.prepMinutes,
    p_cook_minutes: input.draft.cookMinutes,
    p_rest_minutes: input.draft.restMinutes,
    p_difficulty: input.draft.difficulty,
    p_ingredients: input.draft.ingredients,
    p_steps: input.draft.steps,
  });

  if (error || !data) {
    console.error("[customizeRecipe] rpc_create_ai_customized_recipe failed", error);
    const message = error?.message ?? "";
    if (message.includes("not eligible"))
      throw new CustomizeRecipeError("source_not_eligible", messageForCode("source_not_eligible"));
    if (message.includes("not found"))
      throw new CustomizeRecipeError("source_not_found", messageForCode("source_not_found"));
    if (message.includes("different user"))
      throw new CustomizeRecipeError(
        "idempotency_key_conflict",
        messageForCode("idempotency_key_conflict"),
      );
    throw new CustomizeRecipeError("save_failed", messageForCode("save_failed"));
  }

  return data as string;
}
