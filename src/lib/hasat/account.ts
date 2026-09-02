// Uygulama içi hesap silme (Apple 5.1.1(v) zorunluluğu). Mantık DB'de
// (kural #106) — web'in `useDeleteAccount` (hasat-d2c-marketplace/src/lib/hasat/queries.ts)
// ile birebir aynı RPC'yi çağırır, yeniden mantık yazılmadı.
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { removeIntroTourSeen } from "@/lib/hasat/introTour";
import { deleteAccountWithIntroCleanup } from "@/lib/hasat/deleteAccount";

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      await deleteAccountWithIntroCleanup({
        getUserId: async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          return session?.user.id ?? null;
        },
        deleteAccount: async () => {
          const { error } = await supabase.rpc("rpc_delete_own_account");
          if (error) throw error;
        },
        removeIntroTourSeen,
      });
    },
  });
}
