// P23-M7-a — teklif oluşturulduktan sonraki onay ekranı. Sipariş takip
// ekranı bu turda YOK (Berkin kararı, M9'a bırakıldı) — bu yüzden burada
// canlı bir durum göstermiyoruz, yalnızca "gönderildi" onayı + beklenti
// yönetimi (push bildirimi zaten M6'da kurulu altyapıyı kullanıyor).
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { formatCropIngredient } from "@/lib/hasat/format";

export default function OfferConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { crop } = useLocalSearchParams<{ crop?: string }>();

  return (
    <View
      className="flex-1 items-center justify-center bg-navy px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <Text style={{ fontSize: 56 }}>✅</Text>
      <Text className="mt-4 text-center font-serif text-2xl text-hwhite">
        Teklif Gönderildi
      </Text>
      {crop && (
        <Text className="mt-2 text-center text-sm text-hwhite/90">
          {formatCropIngredient(crop)} için teklifiniz üreticiye ulaştı.
        </Text>
      )}
      <Text className="mt-4 text-center text-sm text-hwhite/90">
        Üretici teklifinizi inceleyecek — çiftçi yanıtladığında bildirim
        alacaksın.
      </Text>
      <Text className="mt-2 text-center text-xs text-teal-light">
        Bu işlem ödeme değildir. Kabul edilen teklif için ödeme adımı ayrıca
        hazırlanır.
      </Text>
      <Pressable
        onPress={() => router.replace("/orders")}
        className="mt-8 min-h-12 w-full items-center justify-center rounded-xl bg-teal py-3.5"
      >
        <Text className="text-sm font-medium text-hwhite">Siparişlerim</Text>
      </Pressable>
    </View>
  );
}
