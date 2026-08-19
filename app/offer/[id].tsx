// P23-M8-c2 (T3) — Siparişlerim'deki bir teklife dokununca açılan detay
// ekranı. Kök neden: `app/orders.tsx`'teki `OfferRow` bir `Pressable`
// değildi ve hedef bir detay rotası hiç yoktu (S33 adım 30, bkz.
// `Build/E2E-QA.md` → S33 Bölüm F). Bu ekran salt okunur — Siparişlerim'in
// kendisiyle aynı kapsam kararı (Build/P23-Mobile.md → "Mobil v1 kapsam
// kararı — checkout YOK"): pazarlık yanıtı/ödeme burada da YOK, "web'de
// devam et" yönlendirmesi aynı desenle korunuyor.
//
// Yeni bir sorgu yazılmadı — `useBuyerOffers()` zaten Siparişlerim
// ekranında `["buyerOffersReadonly"]` anahtarıyla önbelleğe alınmış
// durumda; bu ekran aynı hook'u çağırıp listeden `id`'yi buluyor (TanStack
// Query cache-first, ekstra bir ağ isteği yalnızca önbellek yoksa/bayatsa).
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { formatTRY, formatQuantity, formatCropIngredient } from "@/lib/hasat/format";
import { useBuyerOffers, offerStatusLabel } from "@/lib/hasat/orders";
import { DELIVERY_OPTIONS } from "@/lib/hasat/offers";
import { openWebWithSession } from "@/lib/hasat/webLinks";

function deliveryLabel(delivery: string | null): string {
  return DELIVERY_OPTIONS.find((d) => d.id === delivery)?.label ?? "—";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
}

export default function OfferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: offers = [], isLoading } = useBuyerOffers();
  const offer = offers.find((o) => o.id === id);

  const header = (
    <View className="flex-row items-center px-6 pb-3 pt-2">
      <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
        <Text className="text-xl text-hwhite">←</Text>
      </Pressable>
      <Text className="font-serif text-xl font-bold text-hwhite">Teklif Detayı</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C8833B" />
        </View>
      </View>
    );
  }

  if (!offer) {
    return (
      <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
        {header}
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-hmuted">
            Bu teklif bulunamadı — silinmiş veya erişim yetkiniz olmayabilir.
          </Text>
        </View>
      </View>
    );
  }

  const status = offerStatusLabel(offer);
  const total = offer.quantity * offer.pricePerUnit;
  const needsResponse = offer.ballSide === "buyer" && (offer.status === "pending" || offer.status === "counter");
  const needsPayment = offer.status === "accepted" && offer.paymentStatus !== "paid";
  const needsWebAction = needsResponse || needsPayment;

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <View className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <View className="flex-row items-start justify-between">
            <Text className="flex-1 pr-2 font-serif text-xl font-bold text-hwhite">
              {formatCropIngredient(offer.crop)}
            </Text>
            <Text className={`text-xs font-medium ${status.className}`}>{status.label}</Text>
          </View>
          <Text className="mt-1 text-xs text-hmuted">
            {offer.farmerName ?? "Üretici"}
            {offer.farmerCity ? ` · ${offer.farmerCity}` : ""}
          </Text>
        </View>

        <View className="mt-4 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <DetailRow label="Miktar" value={`${formatQuantity(offer.quantity, offer.unit)} ${offer.unit}`} />
          <DetailRow label="Birim fiyat" value={`${formatTRY(offer.pricePerUnit)}/${offer.unit}`} />
          <DetailRow label="Toplam" value={formatTRY(total)} emphasis />
          <DetailRow label="Teslimat" value={deliveryLabel(offer.delivery)} />
          <DetailRow label="Teslim tarihi" value={formatDate(offer.deliveryDate)} />
          <DetailRow label="Oluşturulma" value={formatDate(offer.createdAt)} />
        </View>

        {offer.note && (
          <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="mb-1 text-xs text-hmuted">Not</Text>
            <Text className="text-sm text-hwhite">{offer.note}</Text>
          </View>
        )}

        {needsWebAction && (
          <Pressable
            onPress={() => openWebWithSession(`/buyer/negotiation/${offer.id}`)}
            className="mt-4 items-center rounded-lg border border-saffron py-3"
          >
            <Text className="text-sm font-medium text-saffron">
              {needsPayment ? "Web'de Öde →" : "Web'de Yanıtla →"}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-hmuted">{label}</Text>
      <Text className={emphasis ? "font-mono text-sm font-semibold text-hwhite" : "text-sm text-hwhite"}>
        {value}
      </Text>
    </View>
  );
}
