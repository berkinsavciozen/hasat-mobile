// P23-M8-c (T2) — çiftçi hesabıyla mobil girişte alıcıya özel akışların
// (Sipariş Ver, Talep Et, Siparişlerim) tamamına erişilebiliyordu; bu,
// P23-M7-d'nin "seçenek 3" kararına aykırıydı (tarifler herkese açık kalacak
// ama alıcıya özel akışlarda rol kontrolü olacaktı — o kontrol hiç
// eklenmemişti, bkz. Build/P23-Mobile.md → M5-b "Kural #107 gereği kararı
// Berkin'e bırakılan iki madde"). Bu bileşen üç yerde kullanılıyor:
// app/orders.tsx (Siparişlerim), app/product/[farmerId]/[crop].tsx (Sipariş
// Ver), src/components/hasat/CropRequestSheet.tsx (Talep Et). Tarif
// okuma/kaydetme çiftçiye KAPANMADI — bu bileşen o akışlarda kullanılmıyor.
//
// MOB-WA (2026-09-29): Hasat WhatsApp kanalı şimdilik kapalı; çiftçiler yalnız
// web'e yönlendiriliyor (WhatsApp butonu ve numara sabiti kaldırıldı).
import { View, Text, Pressable } from "react-native";
import { openWebWithSession, WEB_APP_URL } from "@/lib/hasat/webLinks";

// Display form of WEB_APP_URL (no protocol) — keeps this text in sync with
// the single WEB_APP_URL source instead of a second hardcoded domain.
const WEB_APP_HOST = WEB_APP_URL.replace(/^https?:\/\//, "");

export function FarmerRedirectNotice() {
  return (
    <View className="w-full items-center">
      <Text style={{ fontSize: 40 }}>🌾</Text>
      <Text className="mt-4 text-center text-base font-medium text-hwhite">
        Bu uygulama alıcılar için tasarlandı.
      </Text>
      <Text className="mt-2 text-center text-sm text-hmuted">
        Çiftçi işlemlerini web'den ({WEB_APP_HOST}) yapabilirsin.
      </Text>
      <View className="mt-6 w-full gap-2">
        <Pressable
          onPress={() => openWebWithSession("/")}
          className="items-center rounded-xl bg-saffron py-3"
        >
          <Text className="text-sm font-medium text-hwhite">Web'de Aç →</Text>
        </Pressable>
      </View>
    </View>
  );
}
