// P23-M8-b — merkezi oturum temizliği + "silinmiş/yasaklı hesabın oturumu
// canlı kalırsa" güvenlik ağı.
//
// İki ayrı senaryo aynı temizliğe ihtiyaç duyuyor:
//   1. Kullanıcı bilerek çıkış yapıyor / hesabını siliyor (profile.tsx) —
//      biz signOut()'u kendimiz çağırıyoruz.
//   2. `auth.users.banned_until` bir şekilde dolu bir oturum hâlâ cihazda
//      canlıyken (ör. hesap silindikten hemen sonra uygulama kapanmadan,
//      ya da token natural expiry'ye yaklaşıp autoRefreshToken arka planda
//      tazelemeyi denediğinde) gotrue-js bu tazelemeyi GERÇEK bir 401/403
//      (ağ hatası değil — kural: item 1'deki ayrımın simetriği) olarak
//      görüp kendi kendine oturumu temizler ve `SIGNED_OUT` event'i yayınlar.
//      Bu olduğunda kullanıcı hâlâ bir ekranda duruyor olabilir, sonraki her
//      istek sessizce 403 ile kırılırdı — bu dosya bunu yakalayıp anlamlı
//      bir mesajla login'e yönlendiriyor.
//
// Her iki yol da AYNI temizliği (query cache + offline sqlite + zustand
// oturum) tek bir yerden yapar — kural #106'nın ruhu, client içi de olsa
// tekrar eden bir temizlik iki yerde ayrı ayrı sürüklenmesin.
import { router } from "expo-router";
import * as Network from "expo-network";
import { supabase } from "@/lib/supabase/client";
import { queryClient } from "@/lib/query/client";
import { clearRecipeCache } from "@/lib/offline/db";
import { useHasatMobileSession } from "@/lib/store/session";

let expected = false;
let installed = false;
let pendingMessage: string | null = null;

/** Kendi başlattığımız (manuel çıkış / hesap silme) bir signOut'tan hemen
 * önce çağrılır — böylece aşağıdaki dinleyici bunu "beklenmedik oturum
 * sonlanması" olarak görüp kullanıcıya gereksiz bir mesaj göstermez. */
export function markExpectedSignOut(): void {
  expected = true;
}

/** login.tsx mount olduğunda bir kere okunur; varsa gösterilir ve tüketilir. */
export function takePendingSessionMessage(): string | null {
  const m = pendingMessage;
  pendingMessage = null;
  return m;
}

/** `_layout.tsx`'ten uygulama açılışında bir kez çağrılır.
 *
 * P23-M8-b-2 — T1'in kendi düzeltmesinin açtığı regresyon: bu dinleyici HER
 * `SIGNED_OUT`'u gerçek çıkış sayıp temizlik yapıyordu. Kök neden
 * `_layout.tsx`'e eklenen `AppState` kablolanması ile kapatıldı (autoRefresh
 * ticker artık arka planda çalışmıyor, bkz. o dosyadaki not) — burada iki
 * ek savunma katmanı:
 * (1) `expo-network` ile o anki bağlantı durumu kontrol edilir; cihaz
 *     o an offline/gerçek internet yoksa (captive portal dahil) temizlik
 *     atlanır — token storage'da kalıyor (gotrue saf ağ hatalarında zaten
 *     silmiyor), bir sonraki başarılı yenilemede kendiliğinden düzelir.
 * (2) Önbellekte bilinen bir kullanıcı yoksa (önceki bir `SIGNED_OUT`'ta
 *     zaten temizlendiyse) tekrar temizlenecek/bildirilecek bir şey yok —
 *     bu, art arda "oturumun sona erdi" mesajının tekrar tekrar
 *     üretilmesinin (her başarısız yenileme denemesi kendi `SIGNED_OUT`'unu
 *     doğurduğu için) kök nedeniydi. */
export function installSessionGuard(): void {
  if (installed) return;
  installed = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_OUT") return;
    const wasExpected = expected;
    expected = false;
    void (async () => {
      if (!wasExpected) {
        const wasKnownAuthenticated = !!useHasatMobileSession.getState().user;
        if (!wasKnownAuthenticated) return;
        try {
          const net = await Network.getNetworkStateAsync();
          if (net.isConnected === false || net.isInternetReachable === false) return;
        } catch {
          // Durum okunamadıysa temizliğe devam — bilinmiyor diye sonsuza
          // kadar askıda bırakmak daha kötü bir kullanıcı deneyimi olurdu.
        }
      }
      useHasatMobileSession.getState().clear();
      queryClient.clear();
      void clearRecipeCache();
      if (!wasExpected) {
        pendingMessage = "Oturumun sona erdi. Lütfen tekrar giriş yap.";
      }
      router.replace("/login");
    })();
  });
}
