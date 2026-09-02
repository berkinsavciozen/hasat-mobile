// Uygulama içi hesap silme (Apple 5.1.1(v) zorunluluğu). Mantık DB'de
// (kural #106) — web'in `useDeleteAccount` (hasat-d2c-marketplace/src/lib/hasat/queries.ts)
// ile birebir aynı RPC'yi çağırır, yeniden mantık yazılmadı.
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { removeIntroTourSeen } from "@/lib/hasat/introTour";

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      // RPC kullanıcıyı sildikten sonra oturum erişilemez olabilir; hedef ID'yi
      // önce yakala. Temizlik yalnızca RPC başarılı olduktan sonra yapılır ve
      // best-effort olduğu için başarılı hesap silmeyi bloke etmez.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.rpc("rpc_delete_own_account");
      if (error) throw error;
      if (session?.user.id) await removeIntroTourSeen(session.user.id);
    },
  });
}
