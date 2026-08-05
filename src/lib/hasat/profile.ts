// P23-M7-d — profil ekranı. Web'in `useProfile`/`isEffectivelyPremium`
// (hasat-d2c-marketplace/src/lib/hasat/queries.ts) ile birebir aynı sorgu ve
// mantık — yeniden yazılmadı, kopyalandı (bkz. format.ts başlığındaki aynı
// "hasat-core'a taşınmadı, ilk turu küçük tut" kararı).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface ProfileRow {
  id: string;
  name: string | null;
  city: string | null;
  role: string;
  phone: string | null;
  tier: string | null;
  buyer_type: string | null;
  premium_until: string | null;
}

export function isEffectivelyPremium(
  p: Pick<ProfileRow, "tier" | "premium_until"> | null | undefined,
): boolean {
  if (!p || p.tier !== "premium") return false;
  if (!p.premium_until) return true;
  return new Date(p.premium_until).getTime() > Date.now();
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, city, role, phone, tier, buyer_type, premium_until")
        .eq("id", uid)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProfileRow | null;
    },
  });
}
