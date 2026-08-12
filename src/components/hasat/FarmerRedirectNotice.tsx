// P23-M8-c (T2) — çiftçi hesabıyla mobil girişte alıcıya özel akışların
// (Sipariş Ver, Talep Et, Siparişlerim) tamamına erişilebiliyordu; bu,
// P23-M7-d'nin "seçenek 3" kararına aykırıydı (tarifler herkese açık kalacak
// ama alıcıya özel akışlarda rol kontrolü olacaktı — o kontrol hiç
// eklenmemişti, bkz. Build/P23-Mobile.md → M5-b "Kural #107 gereği kararı
// Berkin'e bırakılan iki madde"). Bu bileşen üç yerde kullanılıyor:
// app/orders.tsx (Siparişlerim), app/product/[farmerId]/[crop].tsx (Sipariş
// Ver), src/components/hasat/CropRequestSheet.tsx (Talep Et). Tarif
// okuma/kaydetme çiftçiye KAPANMADI — bu bileşen o akışlarda kullanılmıyor.
import { View, Text, Pressable, Linking } from "react-native";
import { WEB_APP_URL } from "@/lib/hasat/webLinks";

// Web'deki `HASAT_WHATSAPP_NUMBER` (hasat-d2c-marketplace/src/lib/hasat/
// constants.ts) ile aynı değer — iki repo arasında paylaşılan bir kod yolu
// yok (kural #106 DB/RPC'ye taşınacak *mantık* için geçerli, sabit bir
// numara için yeni bir RPC/tablo açmak bu turun kapsamı değil).
const HASAT_WHATSAPP_NUMBER = "905421241011";

export function FarmerRedirectNotice() {
  return (
    <View className="w-full items-center">
      <Text style={{ fontSize: 40 }}>🌾</Text>
      <Text className="mt-4 text-center text-base font-medium text-hwhite">
        Bu uygulama alıcılar için tasarlandı.
      </Text>
      <Text className="mt-2 text-center text-sm text-hmuted">
        Çiftçi işlemlerini web'den (hasat.lovable.app) veya WhatsApp'tan Hasat AI asistanıyla
        yapabilirsin.
      </Text>
      <View className="mt-6 w-full gap-2">
        <Pressable
          onPress={() => Linking.openURL(WEB_APP_URL)}
          className="items-center rounded-xl bg-saffron py-3"
        >
          <Text className="text-sm font-medium text-hwhite">Web'de Aç →</Text>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(`https://wa.me/${HASAT_WHATSAPP_NUMBER}`)}
          className="items-center rounded-xl border border-white/15 py-3"
        >
          <Text className="text-sm font-medium text-hwhite">WhatsApp'ta Aç →</Text>
        </Pressable>
      </View>
    </View>
  );
}
