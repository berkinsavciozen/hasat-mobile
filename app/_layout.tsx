import "../src/styles/global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { View, Text, ActivityIndicator, AppState } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { queryClient } from "@/lib/query/client";
import { supabase } from "@/lib/supabase/client";
import { configureNotifications, attachNotificationTapRouting } from "@/lib/native/notifications";
import { installSessionGuard } from "@/lib/hasat/sessionGuard";

// Final logo/app icon henüz yok (Berkin'in ayrı bir işi) — native splash
// (app.json → "expo-splash-screen" plugin config'i) bu yüzden salt
// `dark` arka plan rengi taşıyor, hiçbir görsele bağımlı değil. Marka
// kimliği (🌸 + "Hasat") JS katmanında bu ekranla veriliyor — login.tsx'in
// kendi ekranındaki aynı desen. Final logo geldiğinde güncellenecek İKİ yer:
// (1) app.json'daki plugin config'ine `image` eklemek, (2) aşağıdaki
// emoji/metni bir <Image> ile değiştirmek — ikisi de tek satırlık değişiklik.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [bootstrapped, setBootstrapped] = useState(false);

  // P23-M8-b-2 — kök neden düzeltmesi: gotrue-js'in kendi belgelenmiş
  // davranışı ("On non-browser platforms the refresh process works
  // *continuously* in the background... You should hook into your
  // platform's foreground indication mechanism") hiç uygulanmamıştı. Bu
  // olmadan `autoRefreshToken` ticker'ı uygulama arka plandayken de sürekli
  // çalışıyordu — token'ın rotasyon penceresinde tam arka plana geçiş/ağ
  // değişimi anına denk gelen bir yenileme denemesi, sunucunun refresh
  // token'ı GERÇEKTEN geçersiz saymasına (kullanılmış/rotasyona uğramış)
  // yol açabiliyordu — bu durumda gotrue-js `SIGNED_OUT`'u haklı olarak
  // yayınlıyor (bkz. sessionGuard.ts — bu ayrı, gerçek bir red, ağ hatası
  // değil) ama kullanıcı hiç bilinçli çıkış yapmamıştı. Resmi Expo/RN
  // deseni tam olarak bu: `AppState` değişince `startAutoRefresh`/
  // `stopAutoRefresh` çağırmak, ticker'ı yalnızca uygulama ön plandayken
  // çalıştırır.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

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

  // İlk JS frame'i (aşağıdaki marka ekranı) commit olduktan hemen sonra
  // native splash'ı kapat — kullanıcı native (salt renk) splash'tan JS'in
  // marka ekranına akışı boş/beyaz bir kare görmeden geçer.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (!bootstrapped) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <Text className="mb-2 text-5xl">🌸</Text>
        <Text className="mb-6 text-4xl font-bold text-saffron">Hasat</Text>
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
