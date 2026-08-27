// F10-lite — bell'den açılan basit bildirim listesi. `notifications` tablosu
// zaten var, RLS `auth.uid() = user_id` (tüm komutlar) — doğrudan okunuyor,
// ayrı bir senkron mekanizması yok. Görsel dil web'in NotificationBell.tsx
// (Sheet) panelinden alındı — aynı emoji-ikon haritası, aynı "Nsa/Ndk"
// göreli zaman formatı, aynı okunmamış vurgusu.
//
// v1.1'e bırakılan (kapsam dışı bu turda): gruplama, filtre. Derin bağlantı
// (dokununca ilgili ekrana gitme) ucuz olduğu için eklendi — mevcut rota
// yapısı zaten `/orders` ve `/home`'u destekliyor, aynı 2 hedefli şema
// `src/lib/native/notifications.ts`teki push-tap `EVENT_ROUTE`'un
// (`notifications.type` yerine push payload event key'i kullanan) aynısı,
// yalnızca isim uzayı `notifications.type` sütununa çevrildi.
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useMarkOneRead,
  type NotificationRow,
} from "@/lib/hasat/notifications";
import { AppIcon, type AppIconName } from "@/components/hasat/AppIcon";
import { brand, semanticLight } from "@/lib/core/design/tokens";

const VISUAL: Record<string, { icon: AppIconName; color: string }> = {
  offer_received: { icon: "mail", color: brand.saffron },
  offer_countered: { icon: "counter", color: brand.saffron },
  subscription_request: { icon: "mail", color: brand.saffron },
  offer_accepted: { icon: "success", color: brand.sage },
  payment_received: { icon: "success", color: brand.sage },
  subscription_accepted: { icon: "success", color: brand.sage },
  crop_request_fulfilled: { icon: "leaf", color: brand.sage },
  offer_rejected: { icon: "counter", color: brand.hred },
  subscription_rejected: { icon: "counter", color: brand.hred },
  order_status: { icon: "orders", color: semanticLight.primary },
};

const DEST: Record<string, "/orders" | "/home"> = {
  offer_received: "/orders",
  offer_accepted: "/orders",
  offer_countered: "/orders",
  offer_rejected: "/orders",
  payment_received: "/orders",
  order_status: "/orders",
  subscription_request: "/orders",
  subscription_accepted: "/orders",
  subscription_rejected: "/orders",
  crop_request_fulfilled: "/home",
  crop_request: "/home",
  harvest_time: "/home",
};

function destFor(n: NotificationRow): "/orders" | "/home" {
  return DEST[n.type] ?? "/home";
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "şimdi";
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  const d = Math.floor(h / 24);
  return `${d}g`;
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { data: rows, isLoading } = useNotifications();
  const { data: count = 0 } = useUnreadCount();
  const markAll = useMarkAllRead();
  const markOne = useMarkOneRead();

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-2">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="mr-2 h-12 w-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Geri"
          >
            <AppIcon name="back" color="#FDFAF5" />
          </Pressable>
          <Text className="font-serif text-xl font-bold text-hwhite">
            Bildirimler
          </Text>
        </View>
        <Pressable
          onPress={() => markAll.mutate()}
          disabled={count === 0 || markAll.isPending}
          className="min-h-11 justify-center px-2"
          accessibilityRole="button"
        >
          <Text
            className="text-xs text-hmuted underline"
            style={{ opacity: count === 0 ? 0.3 : 0.8 }}
          >
            Tümünü okundu işaretle
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F6E82" />
        </View>
      ) : !rows || rows.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppIcon name="notificationsOff" size={36} />
          <Text className="mt-3 text-center text-sm text-hmuted">
            Henüz bildirim yok.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{
            padding: 12,
            paddingBottom: insets.bottom + 24,
          }}
          renderItem={({ item }) => {
            const unread = !item.read_at;
            const visual = VISUAL[item.type] ?? {
              icon: "bell" as const,
              color: semanticLight.primary,
            };
            return (
              <Pressable
                onPress={() => {
                  if (unread) markOne.mutate(item.id);
                  router.push(destFor(item));
                }}
                className="mb-1 flex-row gap-3 rounded-xl px-3 py-3"
                style={
                  unread
                    ? { backgroundColor: `${semanticLight.primary}33` }
                    : undefined
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.body ?? ""}. ${relTime(item.created_at)}`}
              >
                <View className="mt-0.5">
                  <AppIcon name={visual.icon} color={visual.color} />
                </View>
                <View className="flex-1">
                  <Text
                    className={`text-sm ${unread ? "font-semibold text-hwhite" : "text-hwhite/90"}`}
                  >
                    {item.title}
                  </Text>
                  {item.body ? (
                    <Text
                      className="mt-0.5 text-xs text-hmuted"
                      numberOfLines={2}
                    >
                      {item.body}
                    </Text>
                  ) : null}
                  <Text className="mt-1 text-[10px] text-hmuted/70">
                    {relTime(item.created_at)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
