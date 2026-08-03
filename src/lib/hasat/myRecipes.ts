// P23-M6 — "Defterim": kullanıcının kendi (AI ile içe aktardığı) tarifleri.
//
// Public korpustan KESİN AYRIM (Build/P23-Mobile.md → "Zorunlu tasarım
// kuralı"): bu sorgu yalnızca `owner_id = auth.uid()` satırlarını çeker ve
// `useRecipeList` (public+published) ile hiçbir zaman aynı listede
// birleşmez — ekranda ayrı bir sekme olarak duruyor. Ayrım tek başına
// client'a bırakılmış da değil: RLS `recipes auth read public or own`
// politikası zaten başkasının private tarifini döndürmüyor ve
// `recipes auth insert/update own private` WITH CHECK'i sahibinin bile
// kendi importunu public'e çevirmesini engelliyor (gerçek SQL ile
// doğrulandı — TODO.md → P23-M6 doğrulama tablosu).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useIsOffline } from "@/lib/net/useIsOffline";

export interface MyRecipeItem {
  id: string;
  slug: string;
  title: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
  source_type: string;
  status: string;
  extraction_confidence: number | null;
  created_at: string;
}

export const MY_RECIPES_QUERY_KEY = ["myRecipes"] as const;

export function useMyRecipes(enabled = true) {
  const isOffline = useIsOffline();
  return useQuery({
    queryKey: MY_RECIPES_QUERY_KEY,
    // Kişisel taslaklar offline önbelleğe YAZILMIYOR: `expo-sqlite` önbelleği
    // bilinçli olarak yalnızca editoryal/durağan public korpusu tutuyor
    // (bkz. src/lib/offline/db.ts başlığı). Çevrimdışıyken sekme nötr bir
    // bilgi metni gösteriyor, boş liste değil.
    enabled: enabled && !isOffline,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<MyRecipeItem[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "id, slug, title, servings, prep_minutes, cook_minutes, rest_minutes, source_type, status, extraction_confidence, created_at",
        )
        .eq("owner_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        extraction_confidence:
          r.extraction_confidence == null ? null : Number(r.extraction_confidence),
      })) as MyRecipeItem[];
    },
  });
}

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  text: "metinden",
  photo: "fotoğraftan",
  manual: "elle",
  url: "bağlantıdan",
};
