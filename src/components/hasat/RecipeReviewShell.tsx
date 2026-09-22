import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";

/**
 * Import, fotoğraf tahmini, düzenleme ve AI özelleştirme için tek review
 * kabuğu. İçerik akışa özgü kalır; kapatma/kaydetme, safe-area ve hata
 * semantiği aynı karar yüzeyinde ilerler.
 */
export function RecipeReviewShell({
  title,
  saving,
  saveDisabled = false,
  onClose,
  onSave,
  error,
  children,
}: {
  title: string;
  saving: boolean;
  saveDisabled?: boolean;
  onClose: () => void;
  onSave: () => void;
  error?: string | null;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const disabled = saving || saveDisabled;

  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
      <View
        className="flex-row items-center justify-between border-b border-white/10 px-4 pb-2"
        style={{ paddingTop: insets.top + 4 }}
      >
        <Pressable
          onPress={onClose}
          disabled={saving}
          className="h-12 w-12 items-center justify-center rounded-xl"
          accessibilityRole="button"
          accessibilityLabel="Kontrol ekranını kapat"
          accessibilityHint="Kaydedilmemiş değişiklikleri bırakır"
          accessibilityState={{ disabled: saving }}
        >
          <Text className="text-xl text-hwhite">✕</Text>
        </Pressable>
        <Text className="flex-1 text-center text-base font-medium text-hwhite" accessibilityRole="header">
          {title}
        </Text>
        <Pressable
          disabled={disabled}
          onPress={onSave}
          className="min-h-12 min-w-12 items-center justify-center rounded-xl px-2"
          accessibilityRole="button"
          accessibilityLabel={saving ? "Defterime kaydediliyor" : "Defterime kaydet"}
          accessibilityHint="Tarifi yalnızca sana görünen özel bir taslak olarak kaydeder"
          accessibilityState={{ disabled, busy: saving }}
        >
          <Text className="text-base font-medium text-saffron">
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
        {error ? (
          <Text className="mt-4 text-xs text-hred" accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
