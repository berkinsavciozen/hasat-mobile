// P23-M6 — Push token kaydı (`device_tokens`).
//
// SIRA (görev metni madde 3): Android FCM önce — Apple hesabından bağımsız;
// iOS APNs en sona bırakıldı çünkü ücretli Apple Developer hesabı gerekiyor ve
// hesap henüz onaylanmadı (Build/Store-Compliance.md → "Hesap stratejisi").
// Kod her iki platformu da kapsıyor; iOS tarafı bu turda DOĞRULANAMAZ
// (kural #103) — iOS Simulator uzak bildirim almaz, APNs anahtarı yok.
//
// UNIQUE(token) devri: TODO.md → "M6 açık maddeleri"nde duran madde bu turda
// kapandı. Client düz `upsert` YAPMAZ — RLS'in katı UPDATE politikası
// (USING user_id = auth.uid()) başka kullanıcıya ait satırı göremediği için
// düz upsert `new row violates row-level security policy` ile düşüyor (gerçek
// SQL ile kanıtlandı). Devir, tek atomik `rpc_register_device_token`
// fonksiyonunda (SECURITY DEFINER) yapılıyor: cihaz kimde açıksa token onun.
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase/client";
import { getNotificationPermission, requestNotificationPermission } from "./notifications";

const LAST_TOKEN_KEY = "hasat-mobile-push-token";

export type PushRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "permission_denied" }
  | { status: "unsupported"; reason: string }
  | { status: "failed"; reason: string };

function easProjectId(): string | undefined {
  const fromExtra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  return fromExtra ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
}

/**
 * İzin İSTEMEZ — yalnızca izin zaten verilmişse token alır/kaydeder.
 * (Sistem dialogunu bağlamsız açmamak için: çağıran ekran önce açıklama
 * kartını gösterip `requestPushPermissionWithContext` çağırır.)
 */
export async function registerPushTokenIfPermitted(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    // Simülatör/emülatör gerçek push token üretmez — bu, Appetize/iOS
    // Simulator'da push'un neden doğrulanamadığının tam nedeni.
    return { status: "unsupported", reason: "Gerçek cihaz gerekiyor (simülatörde push yok)." };
  }
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    // device_tokens.platform CHECK'i yalnızca 'ios'/'android' kabul ediyor.
    return { status: "unsupported", reason: "Bu platformda push desteklenmiyor." };
  }
  const permission = await getNotificationPermission();
  if (permission !== "granted") return { status: "permission_denied" };

  const projectId = easProjectId();
  if (!projectId) return { status: "failed", reason: "EAS projectId bulunamadı." };

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch (e) {
    // iOS'ta APNs anahtarı yoksa / Android'de FCM kimlik bilgisi yoksa burası
    // patlar. Uygulamanın geri kalanı etkilenmemeli.
    return { status: "failed", reason: (e as Error)?.message ?? "Token alınamadı." };
  }

  // `rpc_register_device_token` P23-M6 migration'ıyla eklendi; hasat-core'un
  // üretilmiş tipleri subtree sync PR'ı inene kadar bu adı bilmiyor
  // (kural #111 — tip tazeliği hasat-core tarafında ayrıca güncellendi).
  const { error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
    }
  ).rpc("rpc_register_device_token", { p_token: token, p_platform: Platform.OS });

  if (error) {
    return { status: "failed", reason: (error as { message?: string })?.message ?? "Kayıt hatası" };
  }

  await AsyncStorage.setItem(LAST_TOKEN_KEY, token);
  return { status: "registered", token };
}

/** Açıklama kartındaki butondan çağrılır: izin iste → verildiyse hemen kaydet. */
export async function requestPushPermissionWithContext(): Promise<PushRegistrationResult> {
  const granted = await requestNotificationPermission();
  if (!granted) return { status: "permission_denied" };
  return registerPushTokenIfPermitted();
}

/**
 * Çıkışta cihazın token'ı silinir — aksi halde kullanıcı çıkış yaptıktan sonra
 * da o cihaza kendi bildirimleri gitmeye devam ederdi. (Aynı cihazda başka
 * biri giriş yaparsa devir zaten RPC'de; bu, "kimse girmedi" durumu.)
 */
export async function unregisterPushTokenOnSignOut(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(LAST_TOKEN_KEY);
    if (!token) return;
    await supabase.from("device_tokens").delete().eq("token", token);
    await AsyncStorage.removeItem(LAST_TOKEN_KEY);
  } catch (e) {
    console.warn("[push] çıkışta token silinemedi", e);
  }
}
