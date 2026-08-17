// P23-M6 — Pişirme Modu. Apple Guideline 4.2 savunmasının en güçlü argümanı
// (Build/Store-Compliance.md → "Hasat'ın 4.2 savunması"): cihaz donanımına
// dayanan, webde yapılamayan bir deneyim — ekranı uyanık tutma, arka planda
// doğru sayan timer, süre dolunca yerel bildirim.
//
// Şartname: Build/P23-Mobile-Visual-Spec.md → "1. Pişirme Modu" (Durum A/B,
// uzun timer ve timer'sız adım uç durumları dahil).
//
// OFFLINE: bu ekran `useRecipeDetail` üzerinden adımları alıyor — ağ yoksa
// M5-b'nin `expo-sqlite` önbelleğinden geliyor. Timer tamamen yerel (DB/ağ
// gerektirmiyor), keep-awake ve bildirim de yerel. Yani pişirme modu uçak
// modunda eksiksiz çalışır (şartname → "2. Offline Durumu" kapsam tablosu:
// "Pişirme modu (önbellekteki bir tarifte) ✅ tamamen").
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  Vibration,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import { useRecipeDetail, formatTimer } from "@/lib/hasat/recipes";
import { useStepTimer, formatCountdown } from "@/lib/native/cookTimer";
import { saveCookSession, clearCookSession } from "@/lib/native/cookSession";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "@/lib/native/notifications";

export default function CookModeScreen() {
  const insets = useSafeAreaInsets();
  const { slug, own, step: stepParam } = useLocalSearchParams<{
    slug: string;
    own?: string;
    step?: string;
  }>();
  const { data, isLoading } = useRecipeDetail(slug, { own: own === "1" });

  // Ekranı uyanık tutma — YALNIZCA bu ekran mount'tayken. `useKeepAwake`
  // unmount'ta otomatik bırakıyor, yani ✕ ile çıkışta / geri gidişte ekran
  // normal davranışına döner (görev metni: "çıkışta bırakılmalı, yoksa pil
  // tüketir"). Şartname keep-awake'i "timer başlayınca" tetikliyordu; burada
  // pişirme modunun tamamı kapsandı — görev metni bu turda kapsamı böyle
  // tanımlıyor ("yalnızca pişirme modunda aktif") ve elleri meşgul kullanıcı
  // timer'sız adımlarda da ekranın kararmasını istemiyor. Şartnamenin
  // "adımdan çıkınca bırak" kuralı bunun alt kümesi.
  useKeepAwake();

  const [index, setIndex] = useState(0);
  const [permissionAsk, setPermissionAsk] = useState(false);
  const permissionResolver = useRef<((granted: boolean) => void) | null>(null);
  const initialStepAppliedRef = useRef(false);

  const steps = data?.steps ?? [];
  const recipe = data?.recipe;
  const step = steps[index];

  // P23-M8-d (T4) — bulgu S33 adım 18: `?step=` parametresi tarif ekranındaki
  // "Devam Et" banner'ından/CTA'sından geliyor (bkz. app/recipe/[slug].tsx),
  // kaldığı adıma DOĞRUDAN atlamak için. Adımlar yüklenmeden index
  // uygulanamaz, bu yüzden yalnızca steps hazır olduğunda ve yalnızca BİR KEZ
  // (kullanıcı sonra elle "Önceki/Sonraki" ile gezinirse üzerine yazılmasın).
  useEffect(() => {
    if (initialStepAppliedRef.current || steps.length === 0) return;
    initialStepAppliedRef.current = true;
    const parsed = stepParam ? Number.parseInt(stepParam, 10) : NaN;
    if (Number.isFinite(parsed)) {
      setIndex(Math.min(Math.max(parsed, 0), steps.length - 1));
    }
  }, [steps.length, stepParam]);

  // Konumu hatırla — timer kurulmasa bile (S33 adım 18: aktif bir timer
  // olmadan da hangi adımda kalındığını bulmak zordu). "Bitir"e kadar
  // silinmiyor (aşağıdaki Bitir handler'ına bkz.) — ✕ ile çıkışta korunuyor,
  // "Devam Et" tam olarak bu senaryo için var.
  useEffect(() => {
    if (!recipe?.id || steps.length === 0) return;
    void saveCookSession(recipe.id, index, steps.length);
  }, [recipe?.id, index, steps.length]);

  /**
   * İzin akışı (görev metni madde 3 ile aynı ilke): çıplak sistem dialogu
   * doğrudan açılmaz. Kullanıcı "Başlat"a bastığında izin henüz sorulmamışsa
   * önce NEDEN sorulduğunu anlatan bir kart çıkar; sistem dialogu ancak
   * oradaki butondan sonra açılır. İzin verilmezse timer yine çalışır.
   */
  const ensurePermission = useCallback(async (): Promise<boolean> => {
    const state = await getNotificationPermission();
    if (state === "granted") return true;
    if (state === "denied") return false;
    setPermissionAsk(true);
    return new Promise<boolean>((resolve) => {
      permissionResolver.current = resolve;
    });
  }, []);

  const timer = useStepTimer({
    recipeId: recipe?.id,
    stepId: step?.id,
    stepNo: step?.step_no ?? index + 1,
    recipeTitle: recipe?.title ?? "Tarif",
    totalSeconds: step?.timer_seconds ?? null,
    ensurePermission,
  });

  // Ön plan tamamlayıcısı: uygulama açıkken bildirim zaten görünür, ek olarak
  // titreşim + ekran içi uyarı veriyoruz (bkz. notifications.ts başlık kararı).
  useEffect(() => {
    if (timer.finished) Vibration.vibrate([0, 400, 200, 400]);
  }, [timer.finished]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  if (!data || steps.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-sm text-hmuted">
          Bu tarifin adımları görüntülenemedi.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-xs text-saffron underline">← Tarife dön</Text>
        </Pressable>
      </View>
    );
  }

  const isLast = index === steps.length - 1;

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      {/* Başlık: kapat + adım sayacı + ilerleme çubuğu (şartname Durum A) */}
      <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
        <Pressable onPress={() => router.back()} hitSlop={16} className="p-1">
          <Text className="text-2xl text-hwhite">✕</Text>
        </Pressable>
        <Text className="text-sm text-hmuted">
          {index + 1} / {steps.length}
        </Text>
      </View>
      <View className="mx-5 mb-2 flex-row gap-1">
        {steps.map((s, i) => (
          <View
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-saffron" : "bg-white/15"}`}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        {step.photo_url ? (
          <Image
            source={{ uri: step.photo_url }}
            className="mb-4 h-44 w-full rounded-2xl"
            resizeMode="cover"
          />
        ) : recipe?.displayPhotoUrl ? (
          <RepresentativePhoto
            src={recipe.displayPhotoUrl}
            isRepresentative={recipe.isRepresentativePhoto}
            alt={recipe.title}
            style={{ width: "100%", height: 176, borderRadius: 16, marginBottom: 16 }}
          />
        ) : null}

        {/* Mutfakta uzaktan okunabilirlik: min ~20sp (şartname Durum A) */}
        <Text className="text-[22px] leading-8 text-hwhite">{step.instruction}</Text>

        {timer.isLongProcess && step.timer_seconds != null && (
          // Uç durum — çok uzun timer: geri sayım YOK, açıklama metni
          <View className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <Text className="text-sm text-hmuted">
              Tahmini süre: {formatTimer(step.timer_seconds)}
            </Text>
            <Text className="mt-1 text-xs text-hmuted">
              Bu kadar uzun bir bekleme için geri sayım tutulmuyor — telefonunu açık
              tutmana gerek yok.
            </Text>
          </View>
        )}

        {timer.available && (
          // Durum B — timer'lı adım: metnin ALTINDA ayrı kart
          <View className="mt-5 items-center rounded-2xl border border-white/10 bg-white/5 p-5">
            <Text className="font-mono text-5xl text-hwhite">
              {formatCountdown(timer.remainingMs)}
            </Text>
            {timer.finished && (
              <Text className="mt-2 text-sm font-medium text-gold">⏰ Süre doldu</Text>
            )}
            <View className="mt-4 flex-row items-center gap-3">
              {timer.running ? (
                <Pressable
                  onPress={() => void timer.pause()}
                  className="rounded-xl border border-white/20 px-5 py-3"
                >
                  <Text className="font-medium text-hwhite">⏸ Durdur</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    timer.acknowledgeFinish();
                    void timer.start();
                  }}
                  className="rounded-xl bg-saffron px-6 py-3"
                >
                  <Text className="font-medium text-hwhite">
                    {timer.remainingMs > 0 && timer.remainingMs < (step.timer_seconds ?? 0) * 1000
                      ? "▶ Devam et"
                      : "▶ Başlat"}
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => void timer.reset()}
                className="rounded-xl border border-white/20 px-5 py-3"
              >
                <Text className="font-medium text-hwhite">↺ Sıfırla</Text>
              </Pressable>
            </View>
            <Text className="mt-3 text-center text-[11px] text-hmuted">
              Uygulamadan çıksan da süre doğru işler; dolduğunda haber veririz.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* İzin açıklaması — sistem dialogundan ÖNCE */}
      {permissionAsk && (
        <View className="absolute inset-0 items-center justify-center bg-dark/90 px-8">
          <View className="w-full rounded-2xl border border-white/10 bg-dark p-5">
            <Text className="text-base font-medium text-hwhite">
              Süre dolunca haber verelim mi?
            </Text>
            <Text className="mt-2 text-sm text-hmuted">
              Telefonu bırakıp mutfaktan ayrılsan bile uyarabilmemiz için bildirim izni
              gerekiyor. İzin vermezsen timer yine çalışır — sadece uygulama kapalıyken
              haber veremeyiz.
            </Text>
            <View className="mt-5 flex-row justify-end gap-3">
              <Pressable
                onPress={() => {
                  setPermissionAsk(false);
                  permissionResolver.current?.(false);
                  permissionResolver.current = null;
                }}
                className="rounded-xl border border-white/20 px-4 py-2.5"
              >
                <Text className="text-sm text-hwhite">Şimdi değil</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  setPermissionAsk(false);
                  const granted = await requestNotificationPermission();
                  permissionResolver.current?.(granted);
                  permissionResolver.current = null;
                }}
                className="rounded-xl bg-saffron px-4 py-2.5"
              >
                <Text className="text-sm font-medium text-hwhite">İzin ver</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Büyük dokunma alanları — eller meşgulken (şartname Durum A) */}
      <View
        className="flex-row gap-3 border-t border-white/10 px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
          className="flex-1 items-center rounded-2xl border border-white/20 py-4"
          style={{ opacity: index === 0 ? 0.35 : 1 }}
        >
          <Text className="text-base font-medium text-hwhite">← Önceki</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (isLast) {
              // Tarif bitti — kaldığın-yerden-devam kaydı artık anlamsız.
              if (recipe?.id) void clearCookSession(recipe.id);
              router.back();
            } else {
              setIndex((i) => Math.min(steps.length - 1, i + 1));
            }
          }}
          className="flex-1 items-center rounded-2xl bg-saffron py-4"
        >
          <Text className="text-base font-medium text-hwhite">
            {isLast ? "Bitir ✓" : "Sonraki →"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
