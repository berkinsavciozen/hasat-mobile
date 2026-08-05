import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase/client";

/**
 * M5-a kapsamı: sadece giriş yapılabiliyor, oturum cihazda kalıcı. Tarif
 * ekranları (Keşfet, Tarifler, Pişirme Modu…) M5-b'de gelecek — bu ekran
 * o zamana kadar geçici bir "giriş yapıldı" göstergesi.
 */
export default function Index() {
  const [checked, setChecked] = useState(false);
  const [target, setTarget] = useState<"/login" | "/home" | "/onboarding">("/login");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (cancelled) return;
      if (!user) {
        setTarget("/login");
        setChecked(true);
        return;
      }
      // Web'in `src/routes/login.tsx`'indeki aynı guard: oturum var ama
      // profil adı boşsa (onboarding yarıda kesilmiş) ana ekran yerine
      // onboarding'e dön.
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const hasProfile = !!profile?.name && profile.name.trim() !== "";
      setTarget(hasProfile ? "/home" : "/onboarding");
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!checked) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  return <Redirect href={target} />;
}
