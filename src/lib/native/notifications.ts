// P23-M6 — yerel bildirim + izin altyapısı (pişirme modu timer'ı ve push ortak
// kullanır).
//
// KARAR — timer bitişinde neden "ses+titreşim" değil YEREL BİLDİRİM (görev
// metni gerekçe istiyordu):
// Şartname (Build/P23-Mobile-Visual-Spec.md → "1. Pişirme Modu") timer'ın
// "arka plana alınmış uygulamada da" çalışmasını ZORUNLU tutuyor — 40 dakikalık
// haşlama gibi kullanıcının telefonu bırakıp mutfaktan ayrıldığı senaryolar
// için. JS tarafında çalan bir ses ya da `Vibration.vibrate()` uygulama askıya
// alındığında (kullanıcı ana ekrana döndü / telefonu kilitledi) TETİKLENMEZ;
// React Native'in timer'ları arka planda durur. OS'e önceden kaydedilen bir
// yerel bildirim ise uygulama kapalıyken bile teslim edilir. Bu yüzden birincil
// mekanizma yerel bildirim.
// Ses+titreşim ELENMEDİ, tamamlayıcı olarak duruyor: Android kanalı
// `vibrationPattern` ile kuruluyor ve uygulama ön plandayken pişirme ekranı
// ayrıca `Vibration.vibrate` + ekran içi "Süre doldu" uyarısı gösteriyor
// (bkz. app/cook/[slug].tsx). Yani arka plan = bildirim, ön plan = bildirim +
// titreşim + görsel uyarı.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const COOK_TIMER_CHANNEL_ID = "cook-timer";
export const GENERAL_CHANNEL_ID = "default";

let configured = false;

/** Uygulama açılışında bir kez çağrılır (app/_layout.tsx). */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;

  // Ön planda da görünsün: varsayılan davranış uygulama açıkken bildirimi
  // göstermemek — mutfakta ekran açıkken timer'ın sessizce geçmesi tam olarak
  // kaçınmak istediğimiz durum.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    // Kanal oluşturmak izin gerektirmiyor; izin isteğinden önce kurulabilir.
    void Notifications.setNotificationChannelAsync(COOK_TIMER_CHANNEL_ID, {
      name: "Pişirme zamanlayıcısı",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      sound: "default",
      enableVibrate: true,
    });
    void Notifications.setNotificationChannelAsync(GENERAL_CHANNEL_ID, {
      name: "Hasat bildirimleri",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250],
      enableVibrate: true,
    });
  }
}

export type PermissionState = "granted" | "denied" | "undetermined";

export async function getNotificationPermission(): Promise<PermissionState> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "undetermined" || canAskAgain) return "undetermined";
  return "denied";
}

/**
 * Çıplak sistem dialogu ASLA doğrudan çağrılmaz — çağıran ekran önce neden
 * izin istendiğini anlatan bir kart gösterir (görev metni madde 3: "kullanıcı
 * neden izin verdiğini anlamalı"). Bu fonksiyon o karttaki butona bağlanır.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return status === "granted";
}

/** Belirli bir ana kurulmuş tek seferlik yerel bildirim. Döndürdüğü kimlik
 * duraklat/sıfırla akışında iptal için saklanır. */
export async function scheduleTimerNotification(params: {
  title: string;
  body: string;
  date: Date;
}): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        // Android 8+ sesi/titreşimi KANAL belirler (aşağıdaki trigger'daki
        // channelId); bu alan iOS tarafı için duruyor.
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: params.date,
        ...(Platform.OS === "android" ? { channelId: COOK_TIMER_CHANNEL_ID } : {}),
      },
    });
  } catch (e) {
    // İzin yoksa/planlama başarısızsa timer'ın kendisi çalışmaya devam etmeli —
    // bildirim bir ek, önkoşul değil.
    console.warn("[notifications] timer bildirimi kurulamadı", e);
    return null;
  }
}

export async function cancelScheduledNotification(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    console.warn("[notifications] bildirim iptali başarısız", e);
  }
}
