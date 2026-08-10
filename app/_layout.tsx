import "../src/styles/global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { View, ActivityIndicator } from "react-native";
import { queryClient } from "@/lib/query/client";
import { supabase } from "@/lib/supabase/client";
import { configureNotifications, attachNotificationTapRouting } from "@/lib/native/notifications";
import { installSessionGuard } from "@/lib/hasat/sessionGuard";

export default function RootLayout() {
  const [bootstrapped, setBootstrapped] = useState(false);

  // P23-M6: bildirim davranışı + Android kanalları. İzin İSTEMEZ (izin akışı
  // bağlam kartlarına bağlı — bkz. PushPermissionCard / pişirme modu);
  // yalnızca uygulama açılışında handler ve kanalları kurar.
  useEffect(() => {
    configureNotifications();
  }, []);

  // P23-M8-b: uzak push bildirimine dokunma → ilgili ekrana yönlendirme.
  useEffect(() => {
    attachNotificationTapRouting();
  }, []);

  // P23-M8-b: merkezi oturum temizliği + "silinmiş/yasaklı hesabın oturumu
  // canlı kalırsa" güvenlik ağı — bkz. sessionGuard.ts dosya başlığı notu.
  useEffect(() => {
    installSessionGuard();
  }, []);

  useEffect(() => {
    // Supabase, storage adaptöründen (LargeSecureStore) oturumu okuyup
    // hydrate ediyor mu diye ilk kontrol — uygulama kapatılıp açıldığında
    // oturumun cihazda kalıcı olduğunu doğrulayan adım budur (bkz. M5-a "E").
    supabase.auth.getSession().finally(() => setBootstrapped(true));
  }, []);

  if (!bootstrapped) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
