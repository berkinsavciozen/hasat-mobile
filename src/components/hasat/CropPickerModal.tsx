// P23-M6-ek — malzeme satırı için manuel crop seçici.
// crop_config'ten (is_edible=true filtresiyle) beslenir — bkz.
// `loadEdibleCropOptions` (src/lib/hasat/import.ts). Bu kod tabanında bu türde
// bir picker/modal ilk kez ekleniyor (grep: mevcut bir örnek yok) — mevcut
// ekranlarla aynı sade Pressable/View/Text + nativewind stiline uyuyor.
import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadEdibleCropOptions, type CropOption } from "@/lib/hasat/import";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";

let cachedOptions: CropOption[] | null = null;

export function CropPickerModal({
  visible,
  currentCrop,
  ingredientName,
  onClose,
  onSelect,
}: {
  visible: boolean;
  currentCrop: string | null;
  ingredientName: string;
  onClose: () => void;
  onSelect: (crop: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<CropOption[] | null>(cachedOptions);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible || cachedOptions) return;
    setLoadError(false);
    loadEdibleCropOptions()
      .then((opts) => {
        cachedOptions = opts;
        setOptions(opts);
      })
      .catch((e) => {
        console.error("[CropPickerModal] crop listesi yüklenemedi", e);
        setLoadError(true);
      });
  }, [visible]);

  const filtered = useMemo(() => {
    if (!options) return [];
    const q = query.trim().toLocaleLowerCase("tr");
    if (!q) return options;
    return options.filter((o) => o.displayName.toLocaleLowerCase("tr").includes(q));
  }, [options, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingScreen style={{ justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View
          className="max-h-[80%] rounded-t-2xl bg-dark px-5"
          style={{ paddingBottom: insets.bottom + 16, paddingTop: 16 }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-medium text-hwhite" numberOfLines={1}>
              "{ingredientName || "malzeme"}" için ürün
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text className="text-xl text-hwhite">✕</Text>
            </Pressable>
          </View>

          {currentCrop && (
            <Pressable
              onPress={() => onSelect(null)}
              className="mb-3 items-center rounded-xl border border-white/15 py-2.5"
            >
              <Text className="text-sm text-hmuted">Eşleşmeyi kaldır</Text>
            </Pressable>
          )}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Ürün ara…"
            placeholderTextColor="rgba(253,250,245,0.3)"
            className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-hwhite"
          />

          {!options && !loadError && (
            <View className="items-center py-8">
              <ActivityIndicator color="#C8833B" />
            </View>
          )}
          {loadError && (
            <Text className="py-4 text-center text-xs text-hred">
              Ürün listesi yüklenemedi. Bağlantını kontrol edip tekrar dener misin?
            </Text>
          )}
          {options && (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.crop}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text className="py-4 text-center text-xs text-hmuted">Eşleşen ürün yok.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelect(item.crop)}
                  className="flex-row items-center justify-between border-b border-white/5 py-3"
                >
                  <Text className="text-sm text-hwhite">{item.displayName}</Text>
                  {item.crop === currentCrop && <Text className="text-saffron">✓</Text>}
                </Pressable>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}
