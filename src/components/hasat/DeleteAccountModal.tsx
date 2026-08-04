// Uygulama içi hesap silme onay ekranı (Apple 5.1.1(v)). Web'in
// `DeleteAccountModal` (hasat-d2c-marketplace/src/components/hasat/DeleteAccountModal.tsx)
// ile aynı onay metni + aynı RPC — yalnızca UI katmanı platforma özel
// (CropRequestSheet ile aynı Modal deseni).
import { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDeleteAccount } from "@/lib/hasat/account";

const CONFIRM_PHRASE = "HESABIMI SİL";

export function DeleteAccountModal({
  visible,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const deleteAccount = useDeleteAccount();
  const [confirmText, setConfirmText] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const canConfirm = confirmText.trim().toLocaleUpperCase("tr-TR") === CONFIRM_PHRASE;

  const close = () => {
    setConfirmText("");
    setErrorText(null);
    onClose();
  };

  const onConfirm = async () => {
    setErrorText(null);
    try {
      await deleteAccount.mutateAsync();
      setConfirmText("");
      onDeleted();
    } catch (e) {
      setErrorText((e as Error).message || "Hesap silinemedi");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View className="flex-1 justify-end bg-black/50">
        <View
          className="rounded-t-2xl bg-dark px-5"
          style={{ paddingBottom: insets.bottom + 16, paddingTop: 16 }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-medium text-hred">Hesabını Sil</Text>
            <Pressable onPress={close} hitSlop={12}>
              <Text className="text-xl text-hwhite">✕</Text>
            </Pressable>
          </View>

          <Text className="text-sm text-hmuted">Bu işlem geri alınamaz. Sildiğinde:</Text>
          <View className="mt-2 gap-1">
            <Text className="text-sm text-hmuted">
              • Telefonun, adın, adreslerin, banka bilginin ve kaydettiğin tariflerin silinir.
            </Text>
            <Text className="text-sm text-hmuted">
              • Teklif/sipariş/değerlendirme geçmişin, karşı tarafın kaydı ve itibarı korunacak
              şekilde kimliğinden arındırılarak kalır (yasal saklama yükümlülüğü).
            </Text>
            <Text className="text-sm text-hmuted">
              • Aynı telefon numarasıyla dilediğin zaman yeniden kayıt olabilirsin.
            </Text>
          </View>

          <Text className="mb-1 mt-4 text-[11px] uppercase tracking-wider text-hmuted">
            Onaylamak için {CONFIRM_PHRASE} yazın
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={CONFIRM_PHRASE}
            placeholderTextColor="rgba(253,250,245,0.3)"
            autoCapitalize="characters"
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
          />

          {errorText && <Text className="mt-3 text-xs text-hred">{errorText}</Text>}

          <Pressable
            disabled={!canConfirm || deleteAccount.isPending}
            onPress={() => void onConfirm()}
            className="mt-4 items-center rounded-xl bg-hred py-3.5"
            style={{ opacity: !canConfirm || deleteAccount.isPending ? 0.5 : 1 }}
          >
            {deleteAccount.isPending ? (
              <ActivityIndicator color="#FDFAF5" />
            ) : (
              <Text className="font-medium text-hwhite">Hesabımı Kalıcı Olarak Sil</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
