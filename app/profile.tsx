// P23-M7-d — profil ekranı (Berkin kararı). Çıkış ve hesap silme
// `app/home.tsx`'in köşesinden buraya taşındı: ikisi bir arada ve çıkış
// çalışmıyorken kullanıcı yanlışlıkla hesabını silebiliyordu (bkz. TODO.md
// → M7-d build log, "çıkış bug'ı"). Web'in `buyer.account.tsx`'i referans
// alındı: profil kartı + linkler + tam genişlik "Çıkış Yap" + en altta,
// görsel olarak ayrışmış (üstte ayraç + kırmızı outline, dolu değil) "Hesabımı
// Sil" — aynı `DeleteAccountModal`, aynı onay adımı.
import { View, Text, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { useProfile, isEffectivelyPremium } from "@/lib/hasat/profile";
import { DeleteAccountModal } from "@/components/hasat/DeleteAccountModal";
import { unregisterPushTokenOnSignOut } from "@/lib/native/push";
import { markExpectedSignOut } from "@/lib/hasat/sessionGuard";

const TYPE_LABEL: Record<string, string> = {
  restoran: "Restoran",
  otel: "Otel",
  organik_market: "Organik Market",
  ihracatci: "İhracatçı",
  bireysel: "Bireysel",
  diger: "Diğer",
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const localUser = useHasatMobileSession((s) => s.user);
  const { data: profile } = useProfile();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const displayName = profile?.name?.trim() || localUser?.name || "Alıcı";
  const premium = isEffectivelyPremium(profile);
  const buyerType = profile?.buyer_type ?? "diger";

  // P23-M8-b kök neden düzeltmesi (S33 adım 46, hesap silme sonrası oturum
  // temizlenmiyordu): eski kod hem normal çıkışta hem hesap silmede
  // `supabase.auth.signOut()`'u kendi `clear()`/`router.replace()`'iyle
  // birlikte çağırıyordu. Hesap silme yolunda bu, `auth.users.banned_until
  // = 'infinity'` olduğu için sunucuya giden `/logout` isteğinin
  // reddedilebilmesi riskini taşıyordu — `catch {}` hatayı yutsa da
  // Supabase'in kendi oturum kaydı (LargeSecureStore), TanStack Query
  // cache'i ve offline sqlite önbelleği DOKUNULMADAN kalabiliyordu, ekranda
  // önbellekteki "Silinmiş Kullanıcı" profili görünmeye devam ediyordu.
  // Düzeltme, iki parça:
  // (1) Temizlik + yönlendirme merkezi `sessionGuard.ts`'e taşındı —
  //     `SIGNED_OUT` event'ini dinleyip zustand + query cache + offline
  //     sqlite + login'e yönlendirmeyi TEK yerden yapıyor; hem manuel
  //     çıkışta hem hesap silmede hem de (bir oturum bir şekilde canlı
  //     kalıp banned_until nedeniyle bir istek gerçekten reddedildiğinde)
  //     otomatik olarak aynı yoldan geçiyor.
  // (2) Yalnızca hesap silme yolunda `scope: "local"` — hesap artık banned
  //     olduğu için sunucuya `/logout` isteği atmak gereksiz bir ağ
  //     bağımlılığı + red riski taşıyor (item 1'deki ağ-hatası/gerçek-red
  //     ayrımının simetriği). Normal çıkışta `scope` varsayılan (`global`)
  //     bırakıldı — kullanıcı bilerek çıkış yapıyor, refresh token'ının
  //     sunucuda da geçersiz kılınması (diğer cihazlardan da çıkış) doğru
  //     davranış, bunu değiştirmek görev kapsamının dışındaydı.
  const signOut = async () => {
    await unregisterPushTokenOnSignOut();
    markExpectedSignOut();
    await supabase.auth.signOut();
  };

  const afterAccountDeleted = async () => {
    // device_tokens satırı hesap silme RPC'sinde zaten kaldırıldı —
    // unregisterPushTokenOnSignOut() burada gereksiz (0 satır etkiler).
    markExpectedSignOut();
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-6 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
          <Text className="text-xl text-hwhite">←</Text>
        </Pressable>
        <Text className="font-serif text-xl font-bold text-hwhite">Hesabım</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 48 }}>
        <View className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-gold">
              <Text className="text-xl font-bold text-dark">{displayName[0] ?? "A"}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-serif text-lg text-hwhite">{displayName}</Text>
              <Text className="text-xs text-hmuted">{TYPE_LABEL[buyerType] ?? buyerType}</Text>
            </View>
            <View className={`rounded-full px-2.5 py-1 ${premium ? "bg-gold" : "bg-white/10"}`}>
              <Text className={`text-[11px] font-medium ${premium ? "text-dark" : "text-hmuted"}`}>
                {premium ? "★ Premium" : "Ücretsiz"}
              </Text>
            </View>
          </View>
          {profile?.city ? <Text className="mt-3 text-xs text-hmuted">📍 {profile.city}</Text> : null}
          {profile?.phone ? <Text className="mt-1 text-xs text-hmuted">📞 {profile.phone}</Text> : null}
        </View>

        <Pressable
          onPress={() => router.push("/orders")}
          className="mt-4 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <Text className="text-sm font-medium text-hwhite">📦 Siparişlerim</Text>
          <Text className="text-hmuted">›</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/notif-prefs")}
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4"
        >
          <Text className="text-sm font-medium text-hwhite">🔔 Bildirim Tercihleri</Text>
          <Text className="text-hmuted">›</Text>
        </Pressable>

        <Pressable
          onPress={signOut}
          className="mt-8 w-full items-center rounded-xl bg-hred py-3.5"
        >
          <Text className="font-medium text-hwhite">Çıkış Yap</Text>
        </Pressable>

        <View className="mt-10 border-t border-white/10 pt-6">
          <Pressable
            onPress={() => setDeleteOpen(true)}
            className="w-full items-center rounded-xl border border-hred py-3.5"
          >
            <Text className="text-sm font-medium text-hred">Hesabımı Sil</Text>
          </Pressable>
        </View>
      </ScrollView>

      <DeleteAccountModal
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          setDeleteOpen(false);
          void afterAccountDeleted();
        }}
      />
    </View>
  );
}
