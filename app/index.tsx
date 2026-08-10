import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { useIsOffline } from "@/lib/net/useIsOffline";

/**
 * M5-a kapsamı: sadece giriş yapılabiliyor, oturum cihazda kalıcı. Tarif
 * ekranları (Keşfet, Tarifler, Pişirme Modu…) M5-b'de gelecek — bu ekran
 * o zamana kadar geçici bir "giriş yapıldı" göstergesi.
 *
 * P23-M8-b kök neden düzeltmesi (S33 adım 11-14, uçak modu → giriş ekranı):
 * `supabase.auth.getSession()`, storage'daki token süresi dolmuşsa (veya
 * dolmaya yakınsa) `autoRefreshToken` ile ağa çıkıp yeniler — offline'da bu
 * istek `AuthRetryableFetchError` ile başarısız olur ve gotrue-js bu turun
 * `session`'ını `null` döndürür (storage'daki token'ı SİLMEZ, sadece bu
 * çağrının sonucu boş döner). Önceki kod bunu "oturum yok" ile aynı
 * sayıyordu → uçak modunda her açılışta giriş ekranına düşüyordu. Ağ hatası
 * ile gerçek kimlik doğrulama reddi (401/403, invalid_grant — token
 * GERÇEKTEN geçersiz) burada ayrıştırılıyor: ağ kaynaklı bir başarısızlıkta
 * `useHasatMobileSession`'ın (LargeSecureStore'da kalıcı) önbelleklediği son
 * bilinen kullanıcıya güvenip devam ediyoruz; yalnızca gerçek bir red
 * durumunda (veya hiç yerel kullanıcı yoksa) login'e düşüyoruz.
 */
function isNetworkAuthError(error: { message?: string; name?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("network") || message.includes("fetch");
}

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [target, setTarget] = useState<"/login" | "/home" | "/onboarding">("/login");
  const cachedUser = useHasatMobileSession((s) => s.user);
  const isOffline = useIsOffline();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;

      if (!user) {
        if ((isOffline || isNetworkAuthError(error)) && cachedUser) {
          setTarget(cachedUser.name ? "/home" : "/onboarding");
          setChecked(true);
          return;
        }
        setTarget("/login");
        setChecked(true);
        return;
      }

      if (isOffline) {
        // Token yerelde geçerli (henüz refresh gerekmedi) ama profil
        // sorgusu ağ ister — offline'da bunu deneyip "yükleniyor"da takılmak
        // yerine yerel önbellekteki isme güveniyoruz (aynı kaynak: login.tsx
        // girişte `updateUser`'a yazıyor).
        setTarget(cachedUser?.name ? "/home" : "/onboarding");
        setChecked(true);
        return;
      }

      // Web'in `src/routes/login.tsx`'indeki aynı guard: oturum var ama
      // profil adı boşsa (onboarding yarıda kesilmiş) ana ekran yerine
      // onboarding'e dön.
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const hasProfile = !!profile?.name && profile.name.trim() !== "";
      setTarget(hasProfile ? "/home" : "/onboarding");
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOffline, cachedUser]);

  if (!checked) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  return <Redirect href={target} />;
}
