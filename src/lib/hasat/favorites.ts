// F5 — Hasat tariflerini favorileme. Berkin kararı: yalnızca kişisel yer imi,
// herkese açık bir "N kişi beğendi" sayacı YOK — en basit doğru yorum.
// `recipe_saves` (user_id, recipe_id, UNIQUE(user_id, recipe_id)) zaten
// şemada var, RLS `user_id = auth.uid()` ile dört yol için de açık (gerçek
// SQL ile doğrulandı) — burada yeni bir policy YAZILMADI.
//
// Desen `notifPrefs.ts`'teki optimistic update + rollback'in birebir aynısı
// (kural #106): dokununca `["recipeSaved", recipeId]` hemen güncellenir,
// ağ isteği arkada gider, başarısız olursa `onError` önceki değere döner.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useIsOffline } from "@/lib/net/useIsOffline";

export interface FavoriteRecipeItem {
  id: string;
  slug: string;
  title: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const FAVORITE_RECIPES_QUERY_KEY = ["favoriteRecipes"] as const;

/** Defterim → "Favorilerim" bölümü — kullanıcının favorilediği Hasat
 * tarifleri (public korpustan), "Tariflerim" (kendi importları) ile
 * KARIŞMAZ; ayrı bir sorgu/anahtar, ayrı bir liste. */
export function useFavoriteRecipes(enabled = true) {
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: FAVORITE_RECIPES_QUERY_KEY,
    enabled: enabled && !isOffline,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<FavoriteRecipeItem[]> => {
      const uid = await getUserId();
      if (!uid) return [];
      const { data, error } = await supabase
        .from("recipe_saves")
        .select(
          "created_at, recipes(id, slug, title, servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine)",
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.recipes as unknown as FavoriteRecipeItem | null)
        .filter((r): r is FavoriteRecipeItem => !!r);
    },
  });
}

function recipeSavedQueryKey(recipeId: string | undefined) {
  return ["recipeSaved", recipeId] as const;
}

/** Tarif detay ekranındaki kalp ikonunun durumu. */
export function useIsRecipeSaved(recipeId: string | undefined) {
  return useQuery({
    queryKey: recipeSavedQueryKey(recipeId),
    enabled: !!recipeId,
    queryFn: async (): Promise<boolean> => {
      const uid = await getUserId();
      if (!uid) return false;
      const { data, error } = await supabase
        .from("recipe_saves")
        .select("id")
        .eq("user_id", uid)
        .eq("recipe_id", recipeId!)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}

export function useToggleRecipeSave(recipeId: string | undefined) {
  const qc = useQueryClient();
  const key = recipeSavedQueryKey(recipeId);
  return useMutation({
    mutationFn: async (nextSaved: boolean) => {
      const uid = await getUserId();
      if (!uid) throw new Error("Oturum bulunamadı");
      if (!recipeId) throw new Error("Tarif bulunamadı");
      if (nextSaved) {
        const { error } = await supabase
          .from("recipe_saves")
          .upsert({ user_id: uid, recipe_id: recipeId }, { onConflict: "user_id,recipe_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("recipe_saves")
          .delete()
          .eq("user_id", uid)
          .eq("recipe_id", recipeId);
        if (error) throw error;
      }
    },
    onMutate: async (nextSaved) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<boolean>(key);
      qc.setQueryData<boolean>(key, nextSaved);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData<boolean>(key, ctx?.prev ?? false);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: FAVORITE_RECIPES_QUERY_KEY });
    },
  });
}
