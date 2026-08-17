// P23-M7-d — Siparişler ekranı, salt okunur (görev metni kapsam kararı).
// M7-a mobilde teklif oluşturmayı getirdi ama kullanıcı oluşturduğu teklifin
// ne olduğunu göremiyordu — yarım bir huniydi. Pazarlık yanıtı (karşı
// teklife cevap) burada YOK — mevcut plan kararı (Build/P23-Mobile.md →
// "M8 sonrası"), "web'de devam et" yönlendirmesi kalıyor. Ödeme yok.
//
// P23-M8-c2 (T3) — bir teklife dokununca hiçbir şey olmuyordu: satır
// (`OfferRow`) bir `Pressable` değil düz bir `View`'dı, hedef bir detay
// ekranı da hiç yoktu (S33 adım 30). Kök neden ikisi birden — dokunma alanı
// eksikti VE navigasyon hiç kurulmamıştı. Bkz. `app/offer/[id].tsx`.
//
// RLS: `offers`/`orders` SELECT politikaları zaten `buyer_id = auth.uid()`
// ile taraf-bazlı — web'in kullandığı aynı politika, burada yeni bir
// politika yazılmadı.
import { useCallback, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Linking } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatTRY, formatQuantity } from "@/lib/hasat/format";
import {
  useBuyerOffers,
  useBuyerOrders,
  offerStatusLabel,
  ORDER_STATUS_LABEL,
  type BuyerOfferRow,
  type BuyerOrderRow,
} from "@/lib/hasat/orders";
import { WEB_APP_URL } from "@/lib/hasat/webLinks";
import { useHasatMobileSession } from "@/lib/store/session";
import { FarmerRedirectNotice } from "@/components/hasat/FarmerRedirectNotice";

type Tab = "offers" | "orders";

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const role = useHasatMobileSession((s) => s.role);
  const [tab, setTab] = useState<Tab>("offers");
  const { data: offers = [], isLoading: offersLoading } = useBuyerOffers();
  const { data: orders = [], isLoading: ordersLoading } = useBuyerOrders();

  // P23-M8-b-2 — sipariş durumu web↔mobil senkron değildi: web'de ödemesi
  // onaylanan bir sipariş mobilde güncellenmiyordu. Web tarafı realtime
  // subscription kullanıyor (`useRealtimeSync`, `hasat-d2c-marketplace/src/
  // lib/hasat/queries.ts`); mobilde bu ekranın ne realtime ne öne gelince
  // yeniden çekme mekanizması vardı — ikisi de yoktu. Web'in websocket
  // kanalını mobile taşımak arka plana alındığında bağlantının düşmesi/geri
  // gelmesi riskini (aynı auth-refresh ailesi bug'ı) ekliyor; bunun yerine
  // ekran her odaklandığında (sekmeye geçiş, arka plandan dönüş) mevcut
  // sorgu hook'larını invalidate ediyoruz — TanStack Query'nin zaten
  // desteklediği bir mekanizma, yeni bir mimari değil.
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ["buyerOffersReadonly"] });
      queryClient.invalidateQueries({ queryKey: ["buyerOrdersReadonly"] });
    }, [queryClient]),
  );

  // P23-M8-c (T2): Siparişlerim alıcıya özel bir akış — çiftçi hesabıyla
  // girişte buraya erişim kapatılıp web/WhatsApp'a yönlendirme gösteriliyor
  // (bkz. FarmerRedirectNotice dosya başı notu).
  if (role === "farmer") {
    return (
      <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-6 pb-3 pt-2">
          <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
            <Text className="text-xl text-hwhite">←</Text>
          </Pressable>
          <Text className="font-serif text-xl font-bold text-hwhite">Siparişlerim</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <FarmerRedirectNotice />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-6 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
          <Text className="text-xl text-hwhite">←</Text>
        </Pressable>
        <Text className="font-serif text-xl font-bold text-hwhite">Siparişlerim</Text>
      </View>

      <View className="mx-4 mb-3 flex-row rounded-xl border border-white/10 bg-white/5 p-1">
        <Pressable
          onPress={() => setTab("offers")}
          className={`flex-1 items-center rounded-lg py-2 ${tab === "offers" ? "bg-saffron" : ""}`}
        >
          <Text className={`text-xs font-medium ${tab === "offers" ? "text-hwhite" : "text-hmuted"}`}>
            Tekliflerim ({offers.length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("orders")}
          className={`flex-1 items-center rounded-lg py-2 ${tab === "orders" ? "bg-saffron" : ""}`}
        >
          <Text className={`text-xs font-medium ${tab === "orders" ? "text-hwhite" : "text-hmuted"}`}>
            Siparişler ({orders.length})
          </Text>
        </Pressable>
      </View>

      {tab === "offers" ? (
        offersLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#C8833B" />
          </View>
        ) : (
          <FlatList
            data={offers}
            keyExtractor={(o) => o.id}
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
            ListEmptyComponent={
              <View className="items-center justify-center rounded-2xl border border-dashed border-white/15 p-8">
                <Text className="text-center text-sm text-hmuted">Henüz teklif yok.</Text>
              </View>
            }
            renderItem={({ item }) => <OfferRow offer={item} />}
          />
        )
      ) : ordersLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C8833B" />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          ListEmptyComponent={
            <View className="items-center justify-center rounded-2xl border border-dashed border-white/15 p-8">
              <Text className="text-center text-sm text-hmuted">Henüz sipariş yok.</Text>
            </View>
          }
          renderItem={({ item }) => <OrderRow order={item} />}
        />
      )}
    </View>
  );
}

function OfferRow({ offer }: { offer: BuyerOfferRow }) {
  const status = offerStatusLabel(offer);
  const total = offer.quantity * offer.pricePerUnit;
  const needsResponse = offer.ballSide === "buyer" && (offer.status === "pending" || offer.status === "counter");
  // P23-M8-b-2 — eksik CTA: "Ödeme bekleniyor" (status=accepted, henüz
  // ödenmemiş) durumunda "yanıtınız bekleniyor" durumuyla aynı desende bir
  // web yönlendirme butonu yoktu. Mobil v1'de ödeme yok (Build/P23-Mobile.md
  // → "Mobil v1 kapsam kararı — checkout YOK"), ödeme aynı web sayfasında
  // (`/buyer/negotiation/$offerId`) tamamlanıyor — aynı link, aynı desen.
  const needsPayment = offer.status === "accepted" && offer.paymentStatus !== "paid";
  const needsWebAction = needsResponse || needsPayment;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/offer/[id]", params: { id: offer.id } })}
      className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4"
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-base font-medium text-hwhite">{offer.crop}</Text>
          <Text className="mt-0.5 text-xs text-hmuted">
            {formatQuantity(offer.quantity, offer.unit)} {offer.unit} · {offer.farmerName ?? "Üretici"}
          </Text>
          <Text className="mt-1 font-mono text-sm font-semibold text-hwhite">{formatTRY(total)}</Text>
        </View>
        <Text className={`text-[11px] font-medium ${status.className}`}>{status.label}</Text>
      </View>
      {needsWebAction && (
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Linking.openURL(`${WEB_APP_URL}/buyer/negotiation/${offer.id}`);
          }}
          className="mt-3 items-center rounded-lg border border-saffron py-2.5"
        >
          <Text className="text-xs font-medium text-saffron">
            {needsPayment ? "Web'de Öde →" : "Web'de Yanıtla →"}
          </Text>
        </Pressable>
      )}
    </Pressable>
  );
}

function OrderRow({ order }: { order: BuyerOrderRow }) {
  const label = ORDER_STATUS_LABEL[order.status] ?? order.status;
  return (
    <View className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="font-mono text-[11px] text-hmuted">{order.code}</Text>
          <Text className="mt-1 text-base font-medium text-hwhite">{order.crop}</Text>
          <Text className="mt-0.5 text-xs text-hmuted">
            {formatQuantity(order.quantity, order.unit)} {order.unit} · {order.farmerName ?? "Üretici"}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[11px] font-medium text-hmuted">{label}</Text>
          <Text className="mt-1 font-mono text-sm font-semibold text-gold">{formatTRY(order.total)}</Text>
        </View>
      </View>
    </View>
  );
}
