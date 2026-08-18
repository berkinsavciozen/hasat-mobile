// İlk-kullanım tanıtım turu (buyer). Web'in turuyla (bkz.
// hasat-d2c-marketplace/src/lib/hasat/onboarding-tour.ts →
// FARMER_TOUR_STEPS) aynı ruhta: kısa, adım adım, her an atlanabilir.
// DOM spotlight web'e özel — native karşılığı yok, burada basit bir
// carousel modal (bkz. components/hasat/IntroTourModal.tsx).
//
// Mobil v1 yalnızca tüketici tarafı (bkz. login.tsx'teki `role: "buyer"`
// notu: mobilde çiftçiye özel ekran yok, yeni kayıtlar hep buyer). Bu
// adımlar SADECE gerçekte var olan buyer yüzeylerini anlatıyor.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type IntroTourStep = {
  emoji: string;
  title: string;
  body: string;
};

export const INTRO_TOUR_STORAGE_KEY = "hasat_mobile_intro_done";

export const INTRO_TOUR_STEPS: IntroTourStep[] = [
  {
    emoji: "📖",
    title: "Tarifler",
    body: "Hasat'ın editoryal tarif kütüphanesi burada. Her tarifte, malzemenin Hasat'ta satılıp satılmadığını görürsün.",
  },
  {
    emoji: "🤝",
    title: "Talep Et / Teklif Ver",
    body: "Bir tarifteki malzemeyi beğendin mi? Doğrudan üreticiye talep gönder, teklif ver — aracı yok.",
  },
  {
    emoji: "📦",
    title: "Siparişlerin",
    body: "Talep ettiğin ürünlerin durumunu üstteki 📦 simgesinden, \"Siparişlerim\" ekranında her an takip edebilirsin.",
  },
  {
    emoji: "🔔",
    title: "Bildirimler",
    body: "Teklifin yanıtlandığında, ürün geldiğinde ya da pişirme süren dolduğunda 🔔 zil simgesinden haberin olur.",
  },
];

export async function hasSeenIntroTour(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INTRO_TOUR_STORAGE_KEY)) === "1";
  } catch {
    // Bayrak okunamazsa turu tekrar göstermek, hiç göstermemekten daha
    // güvenli bir varsayılan (kalıcılık kritik bir veri değil, best-effort).
    return false;
  }
}

export async function markIntroTourSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_TOUR_STORAGE_KEY, "1");
  } catch (e) {
    console.warn("[introTour] bayrak yazılamadı", e);
  }
}
