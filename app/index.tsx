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
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasSession(!!data.session?.user);
      setChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session?.user);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!checked) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  if (!hasSession) {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/home" />;
}
