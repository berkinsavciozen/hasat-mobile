import { Text, View } from "react-native";

export function OrdersComingSoonCard() {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Siparişler çok yakında"
      className="mt-3 rounded-xl border border-saffron/60 bg-saffron/10 px-4 py-3"
    >
      <Text className="text-center text-sm font-semibold text-saffron">
        Siparişler çok yakında
      </Text>
    </View>
  );
}
