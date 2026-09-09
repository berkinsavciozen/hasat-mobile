import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Redirect, useFocusEffect, usePathname } from "expo-router";
import { AppState, Pressable, Text, View } from "react-native";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { BrandLogo } from "@/components/hasat/BrandLogo";
import { supabase } from "@/lib/supabase/client";
import { validateSession } from "@/lib/hasat/validateSession";
import { isPublicSessionPath, type ProfileSessionResult } from "@/lib/hasat/profileSession";
import { SeedlingLoader } from "@/components/hasat/SeedlingLoader";

// Module lifetime matches a JS cold start. Route-level boundaries may remount,
// but only the first real session bootstrap is allowed to show brand chrome.
let hasCompletedBootstrap = false;

/** Screen layout runs before screen children mount, including direct deep links. */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const offline = useIsOffline();
  const [revision, setRevision] = useState(0);
  // Path identity does not decide whether brand chrome is shown. Focus stays in
  // the key so the existing B-9 guard still revalidates a screen on return.
  const key = `${offline}:${focused}:${revision}`;
  const [checked, setChecked] = useState<{ key: string; result: ProfileSessionResult } | null>(null);
  useEffect(() => {
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") setRevision((n) => n + 1);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        setRevision((n) => n + 1);
      }
    });
    return () => { app.remove(); subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!focused || path === "/login") return;
    let cancelled = false;
    void validateSession(offline).then((result) => {
      if (!cancelled) {
        hasCompletedBootstrap = true;
        setChecked({ key, result });
      }
    }).catch(() => {
      if (!cancelled) {
        hasCompletedBootstrap = true;
        setChecked({ key, result: { status: "unavailable" } });
      }
    });
    return () => { cancelled = true; };
  }, [key, focused, path, offline]);

  if (path === "/login") return children;
  if (!checked || checked.key !== key) {
    if (hasCompletedBootstrap) {
      return (
        <View
          className="flex-1 justify-center bg-background px-6"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Sayfa yükleniyor"
        >
          <View
            className="gap-4"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View className="h-8 w-2/3 rounded-lg bg-muted" />
            <View className="h-28 w-full rounded-xl bg-muted" />
            <View className="h-20 w-full rounded-xl bg-muted" />
          </View>
        </View>
      );
    }
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-6"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Hasat yükleniyor"
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <BrandLogo variant="wordmark" tone="dark" height={32} style={{ marginBottom: 24 }} />
          <View className="items-center">
            <SeedlingLoader />
          </View>
        </View>
      </View>
    );
  }
  const { status } = checked.result;
  if (status === "invalid" || (status === "guest" && !isPublicSessionPath(path))) return <Redirect href="/login" />;
  if (status === "unavailable" && !isPublicSessionPath(path)) {
    return <View className="flex-1 items-center justify-center bg-dark px-6">
      <Text className="text-hwhite">Oturum doğrulanamadı. Bağlantını kontrol edip tekrar dene.</Text>
      <Pressable onPress={() => setRevision((n) => n + 1)} className="p-4"><Text className="text-hwhite">Tekrar dene</Text></Pressable>
    </View>;
  }
  return children;
}
