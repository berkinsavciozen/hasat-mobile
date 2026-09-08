import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Redirect, usePathname, useFocusEffect } from "expo-router";
import { ActivityIndicator, AppState, Pressable, Text, View } from "react-native";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { BrandLogo } from "@/components/hasat/BrandLogo";
import { supabase } from "@/lib/supabase/client";
import { validateSession } from "@/lib/hasat/validateSession";
import { isPublicSessionPath, type ProfileSessionResult } from "@/lib/hasat/profileSession";

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
  const key = `${path}:${offline}:${focused}:${revision}`;
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
      if (!cancelled) setChecked({ key, result });
    }).catch(() => {
      if (!cancelled) setChecked({ key, result: { status: "unavailable" } });
    });
    return () => { cancelled = true; };
  }, [key, focused, path, offline]);

  if (path === "/login") return children;
  if (!checked || checked.key !== key) {
    return (
      <View className="flex-1 items-center justify-center bg-dark">
        <BrandLogo variant="monogram" tone="dark" height={44} style={{ marginBottom: 10 }} />
        <BrandLogo variant="wordmark" tone="dark" height={26} style={{ marginBottom: 24 }} />
        <ActivityIndicator color="#1F6E82" />
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
