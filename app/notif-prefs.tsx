// F4 — bildirim tercihleri ekranı. Web'in farmer.settings.notifs.tsx /
// buyer.settings.notifs.tsx'inin (aynı notif_prefs tablosu, aynı 16 event/rol
// tablosu — bkz. src/lib/hasat/notif-events.ts) mobil karşılığı, tek ekran:
// rol zaten oturumdan biliniyor, web'deki gibi iki ayrı route'a gerek yok.
// WhatsApp kanalı gösterilmiyor (MOB-WA) — kanal listesi visibleChannels()'tan.
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
  notifEventsForRole,
  visibleChannels,
  type NotifPrefKey,
} from "@/lib/hasat/notif-events";

function Toggle({
  on,
  disabled,
  onPress,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onPress?: () => void;
  label: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="h-11 w-12 items-center justify-center rounded-full p-0.5"
      style={{
        backgroundColor: on ? "#1F6E82" : "rgba(253,250,245,0.15)",
        opacity: disabled ? 0.5 : 1,
      }}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled: !!disabled }}
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
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-6 pb-3 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="mr-2 h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Bildirim tercihlerinden geri dön"
        >
          <Text className="text-xl text-hwhite">←</Text>
        </Pressable>
        <Text className="font-serif text-xl font-bold text-hwhite">
          Bildirim Tercihleri
        </Text>
      </View>

      {isLoading || !prefs ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F6E82" />
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
                  const channels = visibleChannels(e);
                  return channels.map((c, i) => {
                    const col = e.cols[c.key]!;
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
                        <Text className="text-sm text-hwhite/90">
                          {c.label}
                        </Text>
                        <Toggle
                          on={prefs[col]}
                          disabled={update.isPending}
                          label={`${e.label}, ${c.label}`}
                          onPress={() => onToggle(col, !prefs[col])}
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
