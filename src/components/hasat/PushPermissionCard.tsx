// P23-M6 — push izni için BAĞLAM KARTI.
//
// Görev metni madde 3: "kullanıcı neden izin verdiğini anlamalı, çıplak sistem
// dialogunu göstermeden önce bağlam ver". iOS'ta bildirim izni dialogu
// ömür boyu BİR KEZ gösterilebiliyor — bağlamsız gösterilip reddedilirse
// kullanıcıyı Ayarlar'a göndermekten başka yol kalmıyor. Bu yüzden sistem
// dialogu yalnızca bu karttaki butondan sonra açılıyor.
import { View, Text, Pressable } from "react-native";

export function PushPermissionCard({
  onAccept,
  onDismiss,
  busy,
}: {
  onAccept: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <View className="mx-4 mb-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Text className="text-sm font-medium text-hwhite">Haberin olsun mu?</Text>
      <Text className="mt-1.5 text-xs text-hmuted">
        Talep ettiğin ürün Hasat'a geldiğinde, teklifin yanıtlandığında ve
        pişirme modundaki süren dolduğunda sana bildirim göndeririz. Bunun için
        telefonundan izin vermen gerekiyor — istemezsen uygulama aynı şekilde
        çalışmaya devam eder.
      </Text>
      <View className="mt-4 flex-row justify-end gap-3">
        <Pressable
          onPress={onDismiss}
          className="min-h-12 justify-center rounded-xl px-3 py-2"
          accessibilityRole="button"
        >
          <Text className="text-xs text-hmuted">Şimdi değil</Text>
        </Pressable>
        <Pressable
          disabled={busy}
          onPress={onAccept}
          className="min-h-12 justify-center rounded-xl bg-primary px-4 py-2"
          style={{ opacity: busy ? 0.5 : 1 }}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          <Text className="text-xs font-medium text-hwhite">
            {busy ? "…" : "Bildirimlere izin ver"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
