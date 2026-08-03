// Web'in `getOrCreateSessionId()` (localStorage, bkz. hasat-d2c-marketplace/
// src/lib/hasat/session.ts) mobil karşılığı — `recipe_views`'i aynı anon
// ziyaretçiye atfetmek için kalıcı bir UUID.
//
// Karar (P23-M5-b): AsyncStorage (SecureStore değil) — bu id gizli değil,
// web'deki localStorage'ın tam RN karşılığı budur; LargeSecureStore'un AES/
// Keychain katmanı burada gereksiz maliyet olurdu. UUID üretimi
// `crypto.randomUUID()` yerine `crypto.getRandomValues` ile elle kuruluyor:
// Hermes'te `randomUUID` her zaman yok ama `react-native-get-random-values`
// (zaten `large-secure-store.ts` üzerinden bootstrap ediliyor) `getRandomValues`'ı
// garanti ediyor — yeni bir bağımlılık eklemeden RFC4122 v4 üretilebiliyor.
import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_KEY = "hasat-mobile-anon-session-id";

function uuidv4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let cached: string | null = null;

export async function getOrCreateSessionId(): Promise<string> {
  if (cached) return cached;
  const existing = await AsyncStorage.getItem(SESSION_KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const id = uuidv4();
  await AsyncStorage.setItem(SESSION_KEY, id);
  cached = id;
  return id;
}
