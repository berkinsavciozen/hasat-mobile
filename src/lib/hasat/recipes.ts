// Web'in `src/lib/hasat/recipes.ts`'inin mobil karşılığı — aynı sorgular,
// aynı RPC'ler, aynı şema (bkz. hasat-vault/TODO.md kural #106: eşleştirme/
// dönüşüm/alışveriş listesi mantığı DB'de yaşıyor, burada yeniden yazılmıyor,
// yalnızca RPC çağrılıyor). Web'den farklı iki nokta:
//   1. SSR loader yok — TanStack Query hook'ları her iki ekranda da veriyi
//      taşıyor (Expo Router'da server loader karşılığı yok).
//   2. Offline-first: liste/detay önce ağı dener, başarısız olursa (veya
//      cihaz zaten çevrimdışıysa) `offline/recipeCache.ts`'e düşer.
//      `rpc_recipe_availability`/`rpc_recipe_shopping_list` (canlı fiyat/stok)
//      hiçbir zaman önbelleklenmez — bkz. offline/db.ts başlık yorumu.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { getOrCreateSessionId } from "@/lib/hasat/session";
import {
  cacheRecipeList,
  getCachedRecipeList,
  cacheRecipeDetail,
  getCachedRecipeDetail,
  getDetailCacheStats,
} from "@/lib/offline/recipeCache";
import type {
  RecipeListItem,
  RecipeDetail,
  RecipeStepRow,
  RecipeIngredientRow,
  AvailabilityRow,
  ShoppingListRow,
} from "@/lib/hasat/types";

export type {
  RecipeListItem,
  RecipeDetail,
  RecipeStepRow,
  RecipeIngredientRow,
  AvailabilityRow,
  ShoppingListRow,
};
export { DIFFICULTY_LABELS } from "@/lib/hasat/types";

const RECIPE_LIST_COLUMNS =
  "id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags";

/** Web'deki `attachCoverFallback`'in birebir aynısı — kapak fotoğrafı yoksa
 * (P23-M3 itibarıyla 18/18 NULL) ilk ana malzemenin crop görseline, o da
 * yoksa null'a düşer (çağıran taraf null'ı nötr placeholder'a çevirir). */
async function attachCoverFallback<T extends { id: string; cover_photo_url: string | null }>(
  recipes: T[],
): Promise<Array<T & { displayPhotoUrl: string | null; isRepresentativePhoto: boolean }>> {
  const needFallback = recipes.filter((r) => !r.cover_photo_url);
  const firstCropByRecipe = new Map<string, string>();
  if (needFallback.length > 0) {
    const { data: keyIngredients, error } = await supabase
      .from("recipe_ingredients")
      .select("recipe_id, crop, sort_order")
      .in(
        "recipe_id",
        needFallback.map((r) => r.id),
      )
      .eq("is_key_ingredient", true)
      .not("crop", "is", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    for (const row of keyIngredients ?? []) {
      if (row.crop && !firstCropByRecipe.has(row.recipe_id))
        firstCropByRecipe.set(row.recipe_id, row.crop);
    }
  }
  const photoByCrop = new Map<string, string>();
  const crops = Array.from(new Set(firstCropByRecipe.values()));
  if (crops.length > 0) {
    const { data: cropRows, error } = await supabase
      .from("crop_config" as any)
      .select("crop, default_photo_url")
      .in("crop", crops);
    if (error) throw error;
    for (const c of (cropRows ?? []) as unknown as Array<{
      crop: string;
      default_photo_url: string | null;
    }>) {
      if (c.default_photo_url) photoByCrop.set(c.crop, c.default_photo_url);
    }
  }
  return recipes.map((r) => {
    if (r.cover_photo_url)
      return { ...r, displayPhotoUrl: r.cover_photo_url, isRepresentativePhoto: false };
    const crop = firstCropByRecipe.get(r.id);
    const fallback = crop ? photoByCrop.get(crop) : undefined;
    return { ...r, displayPhotoUrl: fallback ?? null, isRepresentativePhoto: !!fallback };
  });
}

async function fetchRecipeListFromNetwork(): Promise<RecipeListItem[]> {
  const { data: recipeRows, error } = await supabase
    .from("recipes")
    .select(RECIPE_LIST_COLUMNS)
    .eq("visibility", "public")
    .eq("status", "published")
    .order("title", { ascending: true });
  if (error) throw error;
  const withCover = await attachCoverFallback((recipeRows ?? []) as any[]);
  return withCover.map((r) => ({ ...r, diet_tags: r.diet_tags ?? [] })) as RecipeListItem[];
}

export interface RecipeListResult {
  items: RecipeListItem[];
  source: "network" | "cache";
  cachedAt: number | null;
}

// Apple 4.2: liste uçak modunda görünüyor olması yetmez — reviewer bir tarife
// dokunduğunda da adım+malzeme görmeli, yoksa "önbellekte yok" tam 4.2
// senaryosu. Bu yüzden liste ağdan başarıyla çekilir çekilmez 18 tarifin
// tamamının detayı da arka planda önbelleklenir (bkz. aşağıdaki
// `prefetchAllRecipeDetails` — bilerek `await` edilmiyor, liste render'ını
// bloklamaz). `detailPrefetchInFlight` aynı anda iki taramanın üst üste
// binmesini önler (staleTime sonrası ardışık refetch'ler gibi).
//
// P23-M6 EKİ — gereksiz tekrar: `detailPrefetchInFlight` yalnızca EŞZAMANLILIĞI
// engelliyordu; ardışık refetch'lerde (staleTime 60 sn) 18 tarifin detayı her
// seferinde yeniden indiriliyordu. Artık önbellek zaten tamsa (detay sayısı ≥
// liste sayısı) ve en eski detay 24 saatten yeniyse tarama hiç başlamıyor.
// 24 saat: editoryal korpus günde bir kez tazelenmesi yeterli bir veri
// (P23-M3'ten beri 18 tarif; içerik değişimi editoryal ve seyrek).
const DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let detailPrefetchInFlight = false;

async function prefetchAllRecipeDetails(
  items: RecipeListItem[],
): Promise<{ cached: number; totalBytes: number; skipped?: boolean }> {
  if (detailPrefetchInFlight) return { cached: 0, totalBytes: 0 };
  try {
    const stats = await getDetailCacheStats();
    if (
      items.length > 0 &&
      stats.count >= items.length &&
      stats.oldestCachedAt != null &&
      Date.now() - stats.oldestCachedAt < DETAIL_CACHE_TTL_MS
    ) {
      return { cached: 0, totalBytes: 0, skipped: true };
    }
  } catch (e) {
    // Önbellek istatistiği okunamazsa prefetch'i yine de yap — Apple 4.2'nin
    // offline testi, tasarruftan önce gelir.
    console.warn("[recipeCache] detay önbellek istatistiği okunamadı", e);
  }
  detailPrefetchInFlight = true;
  const CONCURRENCY = 5;
  let cached = 0;
  let totalBytes = 0;
  try {
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const detail = await fetchRecipeDetailFromNetwork(item.slug);
          if (!detail) return 0;
          await cacheRecipeDetail(detail.recipe, detail.steps, detail.ingredients);
          return JSON.stringify(detail).length;
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value > 0) {
          cached += 1;
          totalBytes += r.value;
        } else if (r.status === "rejected") {
          console.warn("[recipeCache] detay ön-önbellekleme başarısız", r.reason);
        }
      }
    }
    return { cached, totalBytes };
  } finally {
    detailPrefetchInFlight = false;
  }
}

/** Liste ekranı — offline ise (veya ağ başarısız olursa) önbellekten okur. */
export function useRecipeList() {
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: ["recipeList", isOffline],
    queryFn: async (): Promise<RecipeListResult> => {
      if (isOffline) {
        const cached = await getCachedRecipeList();
        return { items: cached.items, source: "cache", cachedAt: cached.cachedAt };
      }
      try {
        const items = await fetchRecipeListFromNetwork();
        await cacheRecipeList(items);
        prefetchAllRecipeDetails(items)
          .then(({ cached, totalBytes, skipped }) => {
            if (skipped) {
              console.log("[recipeCache] detay önbelleği tam ve 24 saatten yeni — prefetch atlandı");
              return;
            }
            if (cached === 0) return;
            console.log(
              `[recipeCache] ${cached}/${items.length} tarif detayı önbelleklendi (~${(totalBytes / 1024).toFixed(1)} KB)`,
            );
          })
          .catch((e) => console.warn("[recipeCache] detay ön-önbellekleme hata", e));
        return { items, source: "network", cachedAt: Date.now() };
      } catch (e) {
        const cached = await getCachedRecipeList();
        if (cached.items.length === 0) throw e;
        return { items: cached.items, source: "cache", cachedAt: cached.cachedAt };
      }
    },
    staleTime: 60 * 1000,
  });
}

async function fetchRecipeDetailFromNetwork(slug: string): Promise<{
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
} | null> {
  const { data: recipeRow, error: recipeErr } = await supabase
    .from("recipes")
    .select(RECIPE_LIST_COLUMNS)
    .eq("slug", slug)
    .eq("visibility", "public")
    .eq("status", "published")
    .maybeSingle();
  if (recipeErr) throw recipeErr;
  if (!recipeRow) return null;

  const [{ data: stepRows, error: stepErr }, { data: ingredientRows, error: ingErr }] =
    await Promise.all([
      supabase
        .from("recipe_steps")
        .select("id, step_no, instruction, photo_url, timer_seconds")
        .eq("recipe_id", recipeRow.id)
        .order("step_no", { ascending: true }),
      supabase
        .from("recipe_ingredients")
        .select("id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class")
        .eq("recipe_id", recipeRow.id)
        .order("sort_order", { ascending: true }),
    ]);
  if (stepErr) throw stepErr;
  if (ingErr) throw ingErr;

  const [withCover] = await attachCoverFallback([recipeRow as any]);
  return {
    recipe: { ...(withCover as any), diet_tags: recipeRow.diet_tags ?? [] },
    steps: (stepRows ?? []) as RecipeStepRow[],
    ingredients: (ingredientRows ?? []) as unknown as RecipeIngredientRow[],
  };
}

/**
 * P23-M6 — kullanıcının KENDİ (private, draft) tarifi. Public sorgudan iki
 * farkı var ve ikisi de bilinçli:
 *   1. `visibility='public' AND status='published'` filtresi yok; onun yerine
 *      `owner_id = auth.uid()`. (RLS zaten başkasının private tarifini
 *      döndürmüyor — bu filtre "kendi taslağım" niyetini açık yazıyor.)
 *   2. HİÇBİR ŞEKİLDE `expo-sqlite` önbelleğine yazılmaz/okunmaz. Önbellek
 *      editoryal public korpusun deposu; oraya bir private taslak yazmak
 *      `getCachedRecipeList()` üzerinden onu offline LİSTEDE gösterirdi —
 *      yani "kullanıcı importu asla public korpusa karışmaz" kuralının
 *      önbellek tarafındaki ihlali olurdu.
 */
async function fetchOwnRecipeDetailFromNetwork(slug: string): Promise<{
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
} | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;

  const { data: recipeRow, error: recipeErr } = await supabase
    .from("recipes")
    .select(RECIPE_LIST_COLUMNS)
    .eq("slug", slug)
    .eq("owner_id", uid)
    .maybeSingle();
  if (recipeErr) throw recipeErr;
  if (!recipeRow) return null;

  const [{ data: stepRows, error: stepErr }, { data: ingredientRows, error: ingErr }] =
    await Promise.all([
      supabase
        .from("recipe_steps")
        .select("id, step_no, instruction, photo_url, timer_seconds")
        .eq("recipe_id", recipeRow.id)
        .order("step_no", { ascending: true }),
      supabase
        .from("recipe_ingredients")
        .select("id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class")
        .eq("recipe_id", recipeRow.id)
        .order("sort_order", { ascending: true }),
    ]);
  if (stepErr) throw stepErr;
  if (ingErr) throw ingErr;

  return {
    recipe: {
      ...(recipeRow as any),
      diet_tags: recipeRow.diet_tags ?? [],
      displayPhotoUrl: recipeRow.cover_photo_url ?? null,
      isRepresentativePhoto: false,
    } as RecipeDetail,
    steps: (stepRows ?? []) as RecipeStepRow[],
    ingredients: (ingredientRows ?? []) as unknown as RecipeIngredientRow[],
  };
}

export interface RecipeDetailResult {
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
  source: "network" | "cache";
  cachedAt: number | null;
}

export function useRecipeDetail(slug: string | undefined, options?: { own?: boolean }) {
  const isOffline = useIsOffline();
  const own = !!options?.own;
  return useQuery({
    queryKey: ["recipeDetail", slug, isOffline, own],
    enabled: !!slug,
    queryFn: async (): Promise<RecipeDetailResult | null> => {
      if (own) {
        if (isOffline) return null;
        const fresh = await fetchOwnRecipeDetailFromNetwork(slug!);
        if (!fresh) return null;
        return { ...fresh, source: "network", cachedAt: Date.now() };
      }
      if (isOffline) {
        const cached = await getCachedRecipeDetail(slug!);
        if (!cached) return null;
        return { ...cached, source: "cache" };
      }
      try {
        const fresh = await fetchRecipeDetailFromNetwork(slug!);
        if (!fresh) return null;
        await cacheRecipeDetail(fresh.recipe, fresh.steps, fresh.ingredients);
        return { ...fresh, source: "network", cachedAt: Date.now() };
      } catch (e) {
        const cached = await getCachedRecipeDetail(slug!);
        if (!cached) throw e;
        return { ...cached, source: "cache" };
      }
    },
    staleTime: 60 * 1000,
  });
}

/** Canlı veri — bilinçli olarak asla önbelleklenmez, offline'da hiç çağrılmaz. */
export function useRecipeAvailability(recipeId: string | undefined) {
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: ["recipeAvailability", recipeId],
    enabled: !!recipeId && !isOffline,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const { data, error } = await supabase.rpc("rpc_recipe_availability", {
        p_recipe_id: recipeId!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as AvailabilityRow[];
    },
  });
}

export function useRecipeShoppingList(recipeId: string | undefined, servings: number | undefined) {
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: ["recipeShoppingList", recipeId, servings],
    enabled: !!recipeId && !isOffline,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ShoppingListRow[]> => {
      const { data, error } = await supabase.rpc("rpc_recipe_shopping_list", {
        p_recipe_id: recipeId!,
        p_servings: servings ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ShoppingListRow[];
    },
  });
}

/**
 * P23-M6-ek — "Sipariş Ver" hedefinin kaynağı. Web'deki `useMatchedListingIds`'in
 * (hasat-d2c-marketplace/src/lib/hasat/recipes.ts) birebir mobil karşılığı:
 * doğrudan `listings` tablosu (anon-safe RLS), crop başına en ucuz aktif
 * ilan — ama web'den farklı olarak `farmer_id`'yi de getiriyor, çünkü mobilde
 * hedef web'in kendi (bugün jenerik `/buyer/discover`'a giden) "Ürün
 * sayfasına git" linki değil, doğrudan `buyer.product.$farmerId.$crop` — bkz.
 * Build/P23-Mobile.md → "P23-M6-ek" (otonom karar, kural #107).
 */
export interface MatchedListing {
  listingId: string;
  farmerId: string;
}

export function useMatchedListingIds(crops: string[]) {
  const key = Array.from(new Set(crops.filter(Boolean))).sort();
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: ["recipeMatchedListingIds", key],
    enabled: key.length > 0 && !isOffline,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, MatchedListing>> => {
      const { data, error } = await supabase
        .from("listings")
        .select("id, crop, farmer_id, price_per_unit")
        .in("crop", key)
        .eq("status", "active")
        .order("price_per_unit", { ascending: true });
      if (error) throw error;
      const map = new Map<string, MatchedListing>();
      for (const row of (data ?? []) as Array<{ id: string; crop: string; farmer_id: string }>) {
        if (!map.has(row.crop)) map.set(row.crop, { listingId: row.id, farmerId: row.farmer_id });
      }
      return map;
    },
  });
}

/**
 * `recipe_views` yazımı — web'deki `useLogRecipeView`'ün mobil karşılığı.
 * `session_id` web'de localStorage'a yazılan bir UUID; mobilde
 * `src/lib/hasat/session.ts` (AsyncStorage) aynı rolü görüyor — aynı ziyaretçi
 * giriş yaptıktan sonra da aynı `session_id`'yi göndermeye devam ediyor.
 * Offline'ken hiç denenmiyor (ağ zaten yok, hata gürültüsü + boşa zaman).
 */
export function useLogRecipeView(recipeId: string | undefined) {
  const isOffline = useIsOffline();
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (!recipeId || isOffline || logged.current === recipeId) return;
    logged.current = recipeId;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const sessionId = await getOrCreateSessionId();
      const { error } = await supabase
        .from("recipe_views")
        .insert({ recipe_id: recipeId, user_id: userData.user?.id ?? null, session_id: sessionId });
      if (error) console.error("[recipe_views] insert failed", error);
    })();
  }, [recipeId, isOffline]);
}

export function toIsoDuration(minutes: number | null | undefined): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `PT${h > 0 ? `${h}H` : ""}${m > 0 ? `${m}M` : ""}`;
}

function formatMinutesPart(minutes: number): string {
  if (minutes < 60) return `${minutes} dk`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
  }
  const d = Math.floor(minutes / 1440);
  const remH = Math.floor((minutes % 1440) / 60);
  return remH > 0 ? `${d} gün ${remH} sa` : `${d} gün`;
}

export function formatTotalMinutes(minutes: number): string {
  return formatMinutesPart(minutes);
}

export function totalRecipeMinutes(r: {
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
}): number {
  return (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) + (r.rest_minutes ?? 0);
}

/** Eşik 120 dk (2 saat) — bkz. web'deki `ADVANCE_START_THRESHOLD_MINUTES`
 * yorumu (P23-M4-c): bu süre üstü bekleme, günün başında planlanmalı. */
export const ADVANCE_START_THRESHOLD_MINUTES = 120;

export function needsAdvanceStart(r: { rest_minutes: number | null }): boolean {
  return (r.rest_minutes ?? 0) > ADVANCE_START_THRESHOLD_MINUTES;
}

/** Üç süre HİÇBİR ZAMAN tek sayıya toplanmaz — bkz. P23-M4-c kararı
 * (Build/P23-Mobile.md), aynı ayrım burada da geçerli. */
export function formatTimeBreakdown(
  prepMinutes: number | null,
  cookMinutes: number | null,
  restMinutes: number | null,
): string {
  const parts: string[] = [];
  if (prepMinutes) parts.push(`${formatMinutesPart(prepMinutes)} hazırlık`);
  if (cookMinutes) parts.push(`${formatMinutesPart(cookMinutes)} pişirme`);
  if (restMinutes) parts.push(`${formatMinutesPart(restMinutes)} dinlenme`);
  return parts.join(" · ");
}

export function formatTimer(seconds: number): string {
  if (seconds < 60) return `${seconds} sn`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} sa`;
  return `${Math.round(seconds / 86400)} gün`;
}

export function useIngredientMaps(availability: AvailabilityRow[], shoppingList: ShoppingListRow[]) {
  const availByIngredient = useMemo(
    () => new Map(availability.map((a) => [a.ingredient_id, a])),
    [availability],
  );
  const shopByIngredient = useMemo(
    () => new Map(shoppingList.map((s) => [s.ingredient_id, s])),
    [shoppingList],
  );
  return { availByIngredient, shopByIngredient };
}
