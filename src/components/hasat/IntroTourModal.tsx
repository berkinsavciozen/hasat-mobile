// İlk-kullanım tanıtım modali — web'in `OnboardingTour`'uyla (bkz.
// hasat-d2c-marketplace/src/components/hasat/OnboardingTour.tsx) aynı ruhta
// bir carousel: "Atla" ve "İleri"/"Bitir" butonları, hiçbir zaman kapatılamaz
// bir blokaj değil (üstteki × yerine dışına dokununca da atlanabilir, tıpkı
// web turunun overlay'ine tıklamak gibi). Adımların içeriği görülme
// durumunu DEĞİŞTİRMEZ — kalıcılık (`hasSeenIntroTour`/`markIntroTourSeen`)
// çağıran ekranın sorumluluğunda (bkz. app/home.tsx).
import { useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { INTRO_TOUR_STEPS } from "@/lib/hasat/introTour";
import { useReducedMotion } from "@/lib/native/useReducedMotion";

export function IntroTourModal({
  visible,
  onFinish,
}: {
  visible: boolean;
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const reduceMotion = useReducedMotion();
  const step = INTRO_TOUR_STEPS[idx];
  const isLast = idx === INTRO_TOUR_STEPS.length - 1;

  const close = () => {
    setIdx(0);
    onFinish();
  };

  if (!step) return null;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "none" : "fade"}
      transparent
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <Pressable
        onPress={close}
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      >
        {/* İçerideki Pressable, dokunuşu burada durdurup dış overlay'in
            `close`'unu tetiklememesini sağlıyor (RN'de responder içteki
            Pressable'a geçtiği için ayrıca stopPropagation gerekmiyor). */}
        <Pressable
          onPress={() => {}}
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-dark p-5"
        >
          <Text style={{ fontSize: 40 }}>{step.emoji}</Text>
          <Text className="mt-3 font-serif text-xl text-hwhite">
            {step.title}
          </Text>
          <Text className="mt-2 text-sm text-hmuted">{step.body}</Text>

          <View className="mt-5 flex-row justify-center gap-1.5">
            {INTRO_TOUR_STEPS.map((_, i) => (
              <View
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    i === idx ? "#C8833B" : "rgba(253,250,245,0.25)",
                }}
              />
            ))}
          </View>

          <View className="mt-5 flex-row items-center justify-between">
            <Pressable
              onPress={close}
              className="min-h-12 justify-center rounded-xl px-3 py-2"
              accessibilityRole="button"
              accessibilityLabel="Tanıtımı atla"
            >
              <Text className="text-sm font-medium text-saffron">Atla</Text>
            </Pressable>
            <Pressable
              onPress={() => (isLast ? close() : setIdx((i) => i + 1))}
              className="min-h-12 justify-center rounded-xl bg-saffron px-5 py-2.5"
              accessibilityRole="button"
              accessibilityLabel={
                isLast ? "Tanıtımı bitir" : "Sonraki tanıtım adımı"
              }
            >
              <Text className="text-sm font-medium text-hwhite">
                {isLast ? "Bitir" : "İleri"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
