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
import type { AppIconName } from "@/components/hasat/AppIcon";
import {
  hasSeenIntroTourInStorage,
  markIntroTourSeenInStorage,
  removeIntroTourSeenFromStorage,
} from "@/lib/hasat/introTourPersistence";
export {
  INTRO_TOUR_STORAGE_KEY_PREFIX,
  introTourStorageKey,
} from "@/lib/hasat/introTourPersistence";

export type IntroTourStep = {
  icon: AppIconName;
  title: string;
  body: string;
};

export const INTRO_TOUR_STEPS: IntroTourStep[] = [
  {
    icon: "notebook",
    title: "Tarifler",
    body: "Hasat'ın editoryal tarif kütüphanesi burada. Her tarifte, malzemenin Hasat'ta satılıp satılmadığını görürsün.",
  },
  {
    icon: "leaf",
    title: "Talep Et / Teklif Ver",
    body: "Bir tarifteki malzemeyi beğendin mi? Doğrudan üreticiye talep gönder, teklif ver — aracı yok.",
  },
  {
    icon: "orders",
    title: "Siparişlerin",
    body: 'Talep ettiğin ürünlerin durumunu üstteki Siparişler simgesinden, "Siparişlerim" ekranında her an takip edebilirsin.',
  },
  {
    icon: "bell",
    title: "Bildirimler",
    body: "Teklifin yanıtlandığında, ürün geldiğinde ya da pişirme süren dolduğunda Bildirimler simgesinden haberin olur.",
  },
];

export async function hasSeenIntroTour(userId: string): Promise<boolean> {
  try {
    return await hasSeenIntroTourInStorage(userId, AsyncStorage);
  } catch {
    // Bayrak okunamazsa turu tekrar göstermek, hiç göstermemekten daha
    // güvenli bir varsayılan (kalıcılık kritik bir veri değil, best-effort).
    return false;
  }
}

export async function markIntroTourSeen(userId: string): Promise<void> {
  try {
    await markIntroTourSeenInStorage(userId, AsyncStorage);
  } catch {
    console.warn("[introTour] bayrak yazılamadı");
  }
}

export async function removeIntroTourSeen(userId: string): Promise<void> {
  try {
    await removeIntroTourSeenFromStorage(userId, AsyncStorage);
  } catch {
    // Hesap silme, kritik olmayan cihaz-yerel temizlik yüzünden takılmamalı.
    // Anahtar/hata nesnesini loglama: tam kullanıcı UUID'si sızmasın.
    console.warn("[introTour] silinen hesap bayrağı temizlenemedi");
  }
}
