// P23-M6-ek'te "Sipariş Ver" burada tanımlı `buyerProductUrl` ile web'e dışarı
// link veriyordu; P23-M7-a'da teklif oluşturma native'e taşındığı için o
// fonksiyon kaldırıldı (kullanan tek yer değişti, bkz. app/recipe/[slug].tsx).
// `WEB_APP_URL` kalıyor — mobil v1'de hâlâ native olmayan iki köprü noktası
// için gerekecek (TODO.md'ye açık madde olarak yazıldı):
//   - Pazarlık yanıtı (karşı teklif): bu turda mobil ekran yok, çiftçi karşı
//     teklif verirse alıcı web'e yönlendirilecek — M8 sonrası.
//   - Sipariş takibi: bu turda mobil ekran yok (Berkin kararı) — "web'de
//     devam et" yönlendirmesi M9 maddesi.
import { Linking } from "react-native";
import { supabase } from "@/lib/supabase/client";
import { resolveWebSessionUrl } from "./webLinksAccess";

// T1 Faz 1: reads from an Expo public env var, falling back to the current
// production domain when it's unset — flip day sets EXPO_PUBLIC_WEB_APP_URL
// and ships a new build (a domain change here needs a new store submission,
// since this value is baked into the binary at build time).
export const WEB_APP_URL = process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://hasat.lovable.app";

// 11. tur — oturum köprüsü: web'e çıkan her nokta kullanıcıyı sıfırdan OTP
// girmeye zorluyordu. `hasat-d2c-marketplace`'e paralel giden turda eklenen
// `/auth/mobile-handoff` rotasına mevcut access/refresh token'ı taşıyoruz —
// o rota `supabase.auth.setSession()` çağırıp `next`'e yönlendiriyor.
//
// T9: token'ların KENDİSİ artık URL fragment'ına hiç konmuyor. Uzun ömürlü
// `refresh_token`'ın fragment'ta taşınması (fragment sunucu loglarına düşmese
// de) tarayıcı geçmişinde ve OS seviyesinde `Linking.openURL()`'i işleyen
// başka bir yüzeyde kalıcı olarak sızabiliyordu — bkz. webLinksAccess.ts başı.
// Bunun yerine `mobile-handoff-issue` edge function'ı (hasat-d2c-marketplace)
// çağrılıyor: gerçek token'lar HTTPS POST body'sinde sunucuya teslim edilir,
// karşılığında 60 saniye geçerli, tek kullanımlık, opak bir nonce döner —
// fragment'a konan tek şey bu nonce. Karar mantığı (nonce alınamazsa/oturum
// yoksa düz URL'e düşme) `resolveWebSessionUrl()`'de, test edilebilir olacak
// şekilde ayrıştırıldı.
export async function openWebWithSession(path: string): Promise<void> {
  const url = await resolveWebSessionUrl(WEB_APP_URL, path, {
    // `getSession()` returns whatever is cached locally with no freshness guarantee — if the access
    // token is close to expiry, the web side would receive a token that's already stale by the time
    // it lands. Refresh first so the handoff always carries a token good for a full session. No
    // active/refreshable session simply resolves to a null session here (same as `getSession()`
    // would), falling through to the plain-URL path.
    refreshSession: async () => {
      const {
        data: { session },
      } = await supabase.auth.refreshSession();
      return { session };
    },
    issueHandoffNonce: async (refreshToken, nextPath) => {
      const { data, error } = await supabase.functions.invoke<{ nonce: string }>(
        "mobile-handoff-issue",
        { body: { refresh_token: refreshToken, next_path: nextPath } },
      );
      if (error || !data?.nonce) return null;
      return { nonce: data.nonce };
    },
  });
  await Linking.openURL(url);
}
