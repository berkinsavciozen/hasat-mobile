// Web'in `RepresentativePhoto.tsx`'inin RN karşılığı — aynı kural: fotoğraf
// `crop_config.default_photo_url` yedeğiyse "Temsili görsel" etiketi
// zorunlu (bkz. Build/P23-Mobile.md → "Fotoğraf stratejisi"). Fotoğraf hiç
// yoksa (kapak da crop görseli de yok) nötr placeholder emoji.
import { useState } from "react";
import { View, Text, Image, StyleSheet } from "react-native";

export function RepresentativePhoto({
  src,
  isRepresentative,
  alt,
  placeholderEmoji = "🍽️",
  style,
}: {
  src: string | null | undefined;
  isRepresentative: boolean;
  alt: string;
  placeholderEmoji?: string;
  style?: object;
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
        accessibilityLabel={alt}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
      {isRepresentative && (
        <View className="absolute bottom-1 right-1 rounded-full bg-dark/70 px-2 py-0.5">
          <Text className="text-[9px] font-medium text-hwhite">Temsili görsel</Text>
        </View>
      )}
    </View>
  );
}
