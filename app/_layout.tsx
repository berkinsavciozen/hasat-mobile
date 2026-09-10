import "@/lib/sentry/init";
import "../src/styles/global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppState } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import * as Sentry from "@sentry/react-native";
import { queryClient } from "@/lib/query/client";
import { supabase } from "@/lib/supabase/client";
import {
  configureNotifications,
  attachNotificationTapRouting,
} from "@/lib/native/notifications";
import { installSessionGuard } from "@/lib/hasat/sessionGuard";
import { SessionBoundary } from "@/components/hasat/SessionBoundary";
import { useReducedMotion } from "@/lib/native/useReducedMotion";

// Native splash and the first JS bootstrap frame intentionally share the same
// dark surface and single wordmark, preventing a white/black hand-off flash.
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const reduceMotion = useReducedMotion();
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

  // İlk JS frame'i (SessionBoundary marka ekranı) commit olduktan hemen sonra
  // native splash'ı kapat — kullanıcı native (salt renk) splash'tan JS'in
  // marka ekranına akışı boş/beyaz bir kare görmeden geçer.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: reduceMotion ? "none" : "default",
          }}
          screenLayout={({ children }) => <SessionBoundary>{children}</SessionBoundary>}
        />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(RootLayout);
