// P23-M6-ek — "Talep Et" formu (crop_requests). Web'in `CropRequestModal`'ının
// mobil karşılığı: `lockCropName` doluysa (crop bir tarif malzemesinden
// geldiyse) ürün adı kilitli — huninin `recipe_rfq_links` atfı kullanıcı adı
// değiştirip başka bir ürün talep ederse bozulmasın diye (web'le aynı kural).
import { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateCropRequest } from "@/lib/hasat/cropRequests";
import type { IngredientClass } from "@/lib/hasat/import";
import { useHasatMobileSession } from "@/lib/store/session";
import { FarmerRedirectNotice } from "@/components/hasat/FarmerRedirectNotice";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";
import { AppIcon } from "@/components/hasat/AppIcon";
import { useReducedMotion } from "@/lib/native/useReducedMotion";

export function CropRequestSheet({
  visible,
  onClose,
  lockCropName,
  initialCropName,
  initialQuantity,
  initialUnit,
  ingredientClass,
  recipeId,
}: {
  visible: boolean;
  onClose: () => void;
  lockCropName: boolean;
  initialCropName: string;
  initialQuantity?: number | null;
  initialUnit?: string | null;
  ingredientClass: IngredientClass | null;
  recipeId?: string;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const role = useHasatMobileSession((s) => s.role);
  const create = useCreateCropRequest();
  const [cropName, setCropName] = useState(initialCropName);
  const [quantity, setQuantity] = useState(
    initialQuantity != null ? String(initialQuantity) : "",
  );
  const [unit, setUnit] = useState(initialUnit ?? "");
  const [region, setRegion] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    const name = (lockCropName ? initialCropName : cropName).trim();
    if (!name) return;
    const q = Number(quantity.replace(",", "."));
    await create.mutateAsync({
      cropName: name,
      quantity: Number.isFinite(q) && q > 0 ? q : null,
      unit: unit.trim() || null,
      region: region.trim() || null,
      note: note.trim() || null,
      recipeId,
      ingredientClass,
    });
    setDone(true);
  };

  const close = () => {
    setDone(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? "none" : "slide"}
      transparent
      onRequestClose={close}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingScreen
        style={{
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <ScrollView
          className="max-h-[85%] rounded-t-2xl bg-dark"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 16,
            paddingTop: 16,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {role === "farmer" ? (
            // P23-M8-c (T2): "Talep Et" alıcıya özel — çiftçi hesabıyla
            // girişte form yerine web/WhatsApp yönlendirmesi gösteriliyor
            // (bkz. FarmerRedirectNotice dosya başı notu).
            <>
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-base font-medium text-hwhite">
                  Talep Et
                </Text>
                <Pressable
                  onPress={close}
                  className="h-12 w-12 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Talep formunu kapat"
                >
                  <AppIcon name="close" color="#FDFAF5" />
                </Pressable>
              </View>
              <View className="items-center py-4">
                <FarmerRedirectNotice />
              </View>
            </>
          ) : done ? (
            <View className="items-center py-6">
              <AppIcon name="success" size={34} color="#6B8F5E" />
              <Text className="mt-3 text-center text-sm text-hwhite">
                Talebiniz alındı — eşleşen üreticilere bildirim gönderildi. Bu
                ürün geldiğinde size de haber vereceğiz.
              </Text>
              <Pressable
                onPress={close}
                className="mt-5 min-h-12 justify-center rounded-xl bg-saffron px-6 py-3"
                accessibilityRole="button"
              >
                <Text className="font-medium text-hwhite">Tamam</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-base font-medium text-hwhite">
                  Talep Et
                </Text>
                <Pressable
                  onPress={close}
                  className="h-12 w-12 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Talep formunu kapat"
                >
                  <AppIcon name="close" color="#FDFAF5" />
                </Pressable>
              </View>

              <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">
                Ürün
              </Text>
              {lockCropName ? (
                <View className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
                  <Text className="text-base capitalize text-hwhite">
                    {initialCropName}
                  </Text>
                </View>
              ) : (
                <TextInput
                  value={cropName}
                  onChangeText={setCropName}
                  className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  accessibilityLabel="Ürün"
                />
              )}

              <View className="mb-3 flex-row gap-2">
                <View className="flex-1">
                  <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">
                    Miktar
                  </Text>
                  <TextInput
                    value={quantity}
                    onChangeText={setQuantity}
                    keyboardType="decimal-pad"
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                    accessibilityLabel="Miktar"
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">
                    Birim
                  </Text>
                  <TextInput
                    value={unit}
                    onChangeText={setUnit}
                    placeholder="kg, g, L…"
                    placeholderTextColor="rgba(253,250,245,0.3)"
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                    accessibilityLabel="Birim"
                  />
                </View>
              </View>

              <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">
                Bölge (opsiyonel)
              </Text>
              <TextInput
                value={region}
                onChangeText={setRegion}
                placeholder="Ör. İstanbul"
                placeholderTextColor="rgba(253,250,245,0.3)"
                className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                accessibilityLabel="Bölge, opsiyonel"
              />

              <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">
                Not (opsiyonel)
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholderTextColor="rgba(253,250,245,0.3)"
                className="mb-4 min-h-[60px] rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-hwhite"
                accessibilityLabel="Not, opsiyonel"
              />

              {create.isError && (
                <Text className="mb-3 text-xs text-hred">
                  Talep gönderilemedi. Tekrar dener misin?
                </Text>
              )}

              <Pressable
                disabled={
                  create.isPending || (!lockCropName && !cropName.trim())
                }
                onPress={() => void submit()}
                className="min-h-12 items-center justify-center rounded-xl bg-saffron py-3.5"
                style={{ opacity: create.isPending ? 0.6 : 1 }}
                accessibilityRole="button"
                accessibilityState={{
                  busy: create.isPending,
                  disabled:
                    create.isPending || (!lockCropName && !cropName.trim()),
                }}
              >
                {create.isPending ? (
                  <ActivityIndicator color="#FDFAF5" />
                ) : (
                  <Text className="font-medium text-hwhite">Talebi Gönder</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}
