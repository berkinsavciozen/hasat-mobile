// F4 — web'in `useNotifPrefs`/`useUpdateNotifPrefs`'inin (hasat-d2c-marketplace
// src/lib/hasat/queries.ts) birebir mobil karşılığı: aynı self-heal deseni
// (satır yoksa varsayılan değerlerle insert), aynı optimistic update+rollback.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { NOTIF_PREF_DEFAULTS, type NotifPrefKey, type NotifPrefsRow } from "@/lib/hasat/notif-events";

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useNotifPrefs() {
  return useQuery({
    queryKey: ["notifPrefs"],
    queryFn: async (): Promise<NotifPrefsRow> => {
      const userId = await getUserId();
      if (!userId) throw new Error("Oturum bulunamadı");
      const { data, error } = await supabase
        .from("notif_prefs" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        await supabase.from("notif_prefs" as any).insert({ user_id: userId, new_offer_sms: true });
        return { ...NOTIF_PREF_DEFAULTS };
      }
      const r = data as unknown as Record<string, unknown>;
      const out = { ...NOTIF_PREF_DEFAULTS };
      (Object.keys(out) as NotifPrefKey[]).forEach((k) => {
        if (typeof r[k] === "boolean") out[k] = r[k] as boolean;
      });
      return out;
    },
  });
}

export function useUpdateNotifPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<NotifPrefsRow>) => {
      const userId = await getUserId();
      if (!userId) throw new Error("Oturum bulunamadı");
      const { error } = await supabase.from("notif_prefs" as any).update(patch as any).eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["notifPrefs"] });
      const prev = qc.getQueryData<NotifPrefsRow>(["notifPrefs"]);
      if (prev) qc.setQueryData<NotifPrefsRow>(["notifPrefs"], { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifPrefs"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifPrefs"] }),
  });
}
