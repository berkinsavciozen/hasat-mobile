import "../src/styles/global.css";
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { View, ActivityIndicator, AppState } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { queryClient } from "@/lib/query/client";
import { supabase } from "@/lib/supabase/client";
import {
  configureNotifications,
  attachNotificationTapRouting,
} from "@/lib/native/notifications";
import { installSessionGuard } from "@/lib/hasat/sessionGuard";
import { useHasatMobileSession } from "@/lib/store/session";
import { BrandLogo } from "@/components/hasat/BrandLogo";

// Final logo geldi (Hasat OS Milestone 3 — Brand Identity Freeze, W2/M1).
// Native splash (app.json → "expo-splash-screen" plugin) artık `image` de
// taşıyor; JS katmanındaki bu ekran login.tsx'in aynı deseniyle marka
// kimliğini (koyu zeminde beyaz monogram+wordmark) sürdürüyor.
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
    //
    // 11. tur kök neden düzeltmesi: `role`, zustand+SecureStore'da kalıcı
    // (bkz. session.ts) ama yalnızca login.tsx'in `verify()` adımında (tam
    // OTP girişi) DB'den yazılıyordu. Soğuk açılışta mevcut bir oturum
    // bulunduğunda rol hiç yeniden sorgulanmıyordu — cihazda daha önce
    // herhangi bir noktada kalmış (muhtemelen eski/yanlış) bir `role`
    // değeri, kullanıcı tekrar `/login`'den geçmediği sürece sessizce
    // kullanılmaya devam ediyordu (FarmerRedirectNotice'ın yanlışlıkla
    // devreye girip alıcı akışlarını ezmesinin en olası açıklaması buydu).
    // Düzeltme: session varsa `profiles.role`'ü tazece çek — login.tsx'in
    // `verify()`'indeki aynı sorgu deseni (kural #106, yeni bir sorgu icat
    // edilmedi) — ve store'a yaz. Session yoksa (misafir/çıkış yapılmış)
    // dokunma, store'un kendi "buyer" varsayılanı kalır.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!session) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (profile) {
          useHasatMobileSession
            .getState()
            .setRole(profile.role === "buyer" ? "buyer" : "farmer");
        }
      })
      .finally(() => setBootstrapped(true));
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
        {/* login.tsx'teki aynı desen: lockup değil, monogram+wordmark ayrı ayrı
            (bkz. login.tsx'teki not — lockup'ın ayırıcı çizgisi wordmark'ın son
            harfinin üzerinden geçiyor, frozen kaynak dosya kusuru). */}
        <BrandLogo
          variant="monogram"
          tone="dark"
          height={44}
          style={{ marginBottom: 10 }}
        />
        <BrandLogo
          variant="wordmark"
          tone="dark"
          height={26}
          style={{ marginBottom: 24 }}
        />
        <ActivityIndicator color="#38A6B3" />
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
