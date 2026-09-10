// Web'in `getOrCreateSessionId()` (localStorage, bkz. hasat-d2c-marketplace/
// src/lib/hasat/session.ts) mobil karşılığı — `recipe_views`'i aynı anon
// ziyaretçiye atfetmek için kalıcı bir UUID.
//
// Karar (P23-M5-b): AsyncStorage (SecureStore değil) — bu id gizli değil,
// web'deki localStorage'ın tam RN karşılığı budur; LargeSecureStore'un AES/
// Keychain katmanı burada gereksiz maliyet olurdu. UUID üretimi `./uuid`'de
// (bkz. o dosyanın başlığı — Hermes/react-native-get-random-values notu).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uuidv4 } from "./uuid";

const SESSION_KEY = "hasat-mobile-anon-session-id";

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
