// İlk-kullanım tanıtım modali — web'in `OnboardingTour`'uyla (bkz.
// hasat-d2c-marketplace/src/components/hasat/OnboardingTour.tsx) aynı ruhta
// bir carousel: "Atla" ve "İleri"/"Bitir" butonları, hiçbir zaman kapatılamaz
// bir blokaj değil (üstteki × yerine dışına dokununca da atlanabilir, tıpkı
// web turunun overlay'ine tıklamak gibi). Adımların içeriği görülme
// durumunu DEĞİŞTİRMEZ — kalıcılık (`hasSeenIntroTour`/`markIntroTourSeen`)
// çağıran ekranın sorumluluğunda (bkz. app/home.tsx).
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  View,
  Text,
  Pressable,
} from "react-native";
import { INTRO_TOUR_STEPS } from "@/lib/hasat/introTour";
import { useReducedMotion } from "@/lib/native/useReducedMotion";
import { AppIcon } from "@/components/hasat/AppIcon";

export function IntroTourModal({
  visible,
  onFinish,
}: {
  visible: boolean;
  onFinish: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const titleRef = useRef<Text>(null);
  const reduceMotion = useReducedMotion();
  const step = INTRO_TOUR_STEPS[idx];
  const isLast = idx === INTRO_TOUR_STEPS.length - 1;

  const close = () => {
    setIdx(0);
    onFinish();
  };

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => {
      const titleNode = findNodeHandle(titleRef.current);
      if (titleNode != null) AccessibilityInfo.setAccessibilityFocus(titleNode);
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, idx]);

  if (!step) return null;

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "none" : "fade"}
      transparent
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        accessible={false}
      >
        <Pressable
          onPress={close}
          style={{ position: "absolute", inset: 0 }}
          accessible={false}
          importantForAccessibility="no"
        />
        {/* Layout container is deliberately non-accessible so VoiceOver reads
            the heading, body, progress, and actions as separate elements. */}
        <View
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-dark p-5"
          accessible={false}
          accessibilityViewIsModal
        >
          <AppIcon name={step.icon} size={40} color="#1F6E82" />
          <Text
            ref={titleRef}
            className="mt-3 font-serif text-xl text-hwhite"
            accessibilityRole="header"
          >
            {step.title}
          </Text>
          <Text className="mt-2 text-sm text-hmuted">{step.body}</Text>

          <View
            className="mt-5 flex-row justify-center gap-1.5"
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${INTRO_TOUR_STEPS.length} adımdan ${idx + 1}. adım`}
          >
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
        </View>
      </View>
    </Modal>
  );
}
