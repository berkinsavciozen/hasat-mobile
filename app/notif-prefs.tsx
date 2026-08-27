// F4 — bildirim tercihleri ekranı. Web'in farmer.settings.notifs.tsx /
// buyer.settings.notifs.tsx'inin (aynı notif_prefs tablosu, aynı 16 event/rol
// tablosu — bkz. src/lib/hasat/notif-events.ts) mobil karşılığı, tek ekran:
// rol zaten oturumdan biliniyor, web'deki gibi iki ayrı route'a gerek yok.
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useHasatMobileSession } from "@/lib/store/session";
import { useNotifPrefs, useUpdateNotifPrefs } from "@/lib/hasat/notifPrefs";
import {
  NOTIF_CHANNELS,
  notifEventsForRole,
  type NotifPrefKey,
} from "@/lib/hasat/notif-events";

function Toggle({
  on,
  disabled,
  onPress,
}: {
  on: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-12 items-center justify-center rounded-full p-0.5"
      style={{
        backgroundColor: on ? "#167F8C" : "rgba(253,250,245,0.15)",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        className="h-4 w-4 rounded-full bg-hwhite"
        style={{ marginLeft: on ? 16 : 0 }}
      />
    </Pressable>
  );
}

export default function NotifPrefsScreen() {
  const insets = useSafeAreaInsets();
  const role = useHasatMobileSession((s) => s.role);
  const { data: prefs, isLoading } = useNotifPrefs();
  const update = useUpdateNotifPrefs();

  const events = notifEventsForRole(role);

  const onToggle = (col: NotifPrefKey, v: boolean) => {
    update.mutate({ [col]: v } as any);
  };

  return (
    <View className="flex-1 bg-navy" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-6 pb-3 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={12} className="mr-3">
          <Text className="text-xl text-hwhite">←</Text>
        </Pressable>
        <Text className="font-serif text-xl font-bold text-hwhite">
          Bildirim Tercihleri
        </Text>
      </View>

      {isLoading || !prefs ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#38A6B3" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {events.map((e) => (
            <View
              key={e.key}
              className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
            >
              <View className="border-b border-white/10 px-4 py-2.5">
                <Text className="text-sm font-medium text-hwhite">
                  {e.label}
                </Text>
              </View>
              <View>
                {(() => {
                  const channels = NOTIF_CHANNELS.filter((c) => e.cols[c.key]);
                  return channels.map((c, i) => {
                    const col = e.cols[c.key]!;
                    const comingSoon =
                      c.key === "whatsapp" && e.whatsappComingSoon;
                    return (
                      <View
                        key={c.key}
                        className="flex-row items-center justify-between px-4 py-2.5"
                        style={
                          i < channels.length - 1
                            ? {
                                borderBottomWidth: 1,
                                borderBottomColor: "rgba(253,250,245,0.05)",
                              }
                            : undefined
                        }
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="text-sm text-hwhite/90">
                            {c.label}
                          </Text>
                          {comingSoon && (
                            <View className="rounded-full bg-white/10 px-1.5 py-0.5">
                              <Text className="text-[9px] text-hmuted">
                                Yakında
                              </Text>
                            </View>
                          )}
                        </View>
                        <Toggle
                          on={prefs[col]}
                          disabled={comingSoon || update.isPending}
                          onPress={
                            comingSoon
                              ? undefined
                              : () => onToggle(col, !prefs[col])
                          }
                        />
                      </View>
                    );
                  });
                })()}
              </View>
            </View>
          ))}
          <Text className="mt-2 text-center text-[11px] text-hmuted">
            Değişiklikler anında kaydedilir.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
