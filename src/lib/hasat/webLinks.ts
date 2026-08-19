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

export const WEB_APP_URL = "https://hasat.lovable.app";

// 11. tur — oturum köprüsü: web'e çıkan her nokta kullanıcıyı sıfırdan OTP
// girmeye zorluyordu. `hasat-d2c-marketplace`'e paralel giden turda eklenen
// `/auth/mobile-handoff` rotasına mevcut access/refresh token'ı taşıyoruz —
// o rota `supabase.auth.setSession()` çağırıp `next`'e yönlendiriyor. Token'lar
// URL fragment'ında (`#...`) taşınıyor, query string'de DEĞİL: fragment'lar
// HTTP isteklerine dahil edilmez, sunucu loglarına düşmez — Supabase'in kendi
// magic-link/OAuth implicit akışının kullandığı desenin aynısı. Hedef rota
// henüz merge olmadıysa (paralel tur) kullanıcı normal `/login`'e düşer —
// kötü bir çökme yok, mevcut davranışla aynı seviye.
export async function openWebWithSession(path: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token && session?.refresh_token) {
    const at = encodeURIComponent(session.access_token);
    const rt = encodeURIComponent(session.refresh_token);
    const next = encodeURIComponent(path);
    await Linking.openURL(
      `${WEB_APP_URL}/auth/mobile-handoff#access_token=${at}&refresh_token=${rt}&next=${next}`,
    );
    return;
  }
  await Linking.openURL(`${WEB_APP_URL}${path}`);
}
