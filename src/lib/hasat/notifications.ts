// F10-lite — web'in `useNotifications`/`useUnreadCount`/`useMarkAllRead`/
// `useMarkOneRead`'inin (hasat-d2c-marketplace src/lib/hasat/queries.ts,
// "NOTIFICATIONS (Phase 7)") birebir mobil karşılığı. `notifications` RLS'i
// `auth.uid() = user_id` (tüm komutlar) — mobil doğrudan tabloyu okuyor, ayrı
// bir senkron mekanizması yok.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
}

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async (): Promise<NotificationRow[]> => {
      const userId = await getUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from("notifications" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifCount"],
    refetchInterval: 30000,
    queryFn: async (): Promise<number> => {
      const userId = await getUserId();
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("notifications" as any)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const userId = await getUserId();
      if (!userId) return;
      const { error } = await supabase
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifCount"] });
    },
  });
}

export function useMarkOneRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications" as any)
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifCount"] });
    },
  });
}
