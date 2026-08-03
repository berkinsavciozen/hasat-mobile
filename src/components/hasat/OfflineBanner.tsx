// Görsel şartname → "2. Offline Durumu", Durum A: bağlantı koptu ama
// önbellek var — üstte kapanmayan bir şerit, altındaki içerik DEĞİŞMEDEN
// render edilir (ayrı bir "offline ekranı" yok).
import { View, Text } from "react-native";

export function OfflineBanner() {
  return (
    <View className="bg-gold/25 px-4 py-2">
      <Text className="text-center text-xs font-medium text-dark">
        📶✕ Çevrimdışısınız · görünen tarifler önbellekten
      </Text>
    </View>
  );
}
