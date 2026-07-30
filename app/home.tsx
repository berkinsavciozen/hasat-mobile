import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";

/**
 * Geçici yer tutucu — M5-b'de tarif listesi/detayı bu route'un yerini
 * alacak (bkz. hasat-vault/Build/P23-Mobile.md → M5/M6). Burada tek amaç:
 * OTP girişinin gerçekten oturum açtığını ve oturumun kalıcı olduğunu
 * (uygulama kapatılıp açıldığında hâlâ burada olunduğunu) gözle görülür
 * kılmak.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState<string | null>(null);
  const role = useHasatMobileSession((s) => s.role);
  const clear = useHasatMobileSession((s) => s.clear);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setPhone(data.user?.phone ?? null));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    clear();
  };

  return (
    <View
      className="flex-1 bg-dark px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <Text className="text-hwhite text-2xl font-bold">Giriş yapıldı ✓</Text>
      <Text className="text-hmuted mt-2">
        {phone ? `+${phone}` : "…"} · rol: {role}
      </Text>
      <Text className="text-hmuted mt-6 text-sm">
        Tarif ekranları M5-b'de gelecek (bkz. Build/P23-Mobile.md → M5/M6).
      </Text>
      <Pressable
        onPress={signOut}
        className="mt-10 rounded-xl bg-saffron py-3 items-center"
      >
        <Text className="text-hwhite font-medium">Çıkış yap</Text>
      </Pressable>
    </View>
  );
}
