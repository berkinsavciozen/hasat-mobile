// Web'in `RepresentativePhoto.tsx`'inin RN karşılığı — aynı kural: fotoğraf
// `crop_config.default_photo_url` yedeğiyse "Temsili görsel" disclosure'ı
// zorunlu (bkz. Build/P23-Mobile.md → "Fotoğraf stratejisi"). Fotoğraf hiç
// yoksa (kapak da crop görseli de yok) nötr placeholder emoji.
//
// P23-M7-g: tam metinli rozet yerine küçük bir ⓘ glifi — dokunuşla açılan
// bir tooltip gösterir (RN'de hover kavramı yok). Glif Unicode karakter
// (ⓘ), ikon kütüphanesi değil — proje hiçbir yerde ikon kütüphanesi
// kullanmıyor, `lucide-react-native` eklemek `react-native-svg` native
// bağımlılığı getirir (bkz. home.tsx'teki aynı gerekçe, EAS build kotası).
// `accessibilityLabel="Temsili görsel"` glifi VoiceOver/TalkBack için tek
// başına anlamlı kılar — tooltip açılmasa bile ekran okuyucu bunu duyurur.
import { useState } from "react";
import { View, Text, Image, StyleSheet, Pressable } from "react-native";

export function RepresentativeBadge({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View className={`absolute ${className || "bottom-1 right-1"}`}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel="Temsili görsel"
        hitSlop={8}
        className="h-5 w-5 items-center justify-center rounded-full bg-dark/70"
      >
        <Text className="text-[11px] leading-none text-hwhite">ⓘ</Text>
      </Pressable>
      {open && (
        <View
          className="absolute bottom-full right-0 mb-1 rounded-md bg-dark/90 px-2 py-1"
          importantForAccessibility="no-hide-descendants"
        >
          <Text className="text-[10px] font-medium text-hwhite">Temsili görsel</Text>
        </View>
      )}
    </View>
  );
}

export function RepresentativePhoto({
  src,
  isRepresentative,
  alt,
  placeholderEmoji = "🍽️",
  style,
  badgeClassName,
}: {
  src: string | null | undefined;
  isRepresentative: boolean;
  alt: string;
  placeholderEmoji?: string;
  style?: object;
  /** Positioning override for the badge, e.g. "top-3 right-3" (default: bottom-right). */
  badgeClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <View className="items-center justify-center bg-cream" style={style} accessibilityLabel={alt}>
        <Text style={{ fontSize: 32 }}>{placeholderEmoji}</Text>
      </View>
    );
  }

  return (
    <View style={[style, { overflow: "hidden" }]}>
      <Image
        source={{ uri: src }}
        accessibilityLabel={isRepresentative ? `${alt} (temsili görsel)` : alt}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
      {isRepresentative && <RepresentativeBadge className={badgeClassName} />}
    </View>
  );
}
