// P23-M8-d (T4) — bulgu S33 adım 18: aktif bir pişirme oturumu varken tarife
// geri dönüldüğünde kaldığı adımı bulmak için tüm adımları baştan gezmek
// gerekiyordu. Burada tutulan tek şey "bu tarifte en son hangi adımdaydın" —
// `cookTimer.ts`'teki gerçek geri sayım durumundan AYRI ve daha basit: bir
// timer hiç kurulmasa da (timer'sız bir adımda kalınsa da) konum hatırlanır.
//
// Bitirme (`Bitir ✓`) oturumu temizler; ✕ ile çıkışta TEMİZLENMEZ — kullanıcı
// mutfaktan ayrılıp geri dönebilir, "Devam Et" tam olarak bu senaryo için var.
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface CookSession {
  stepIndex: number;
  totalSteps: number;
  updatedAt: number;
}

function storageKey(recipeId: string): string {
  return `hasat-cook-session:${recipeId}`;
}

export async function saveCookSession(
  recipeId: string,
  stepIndex: number,
  totalSteps: number,
): Promise<void> {
  try {
    const value: CookSession = { stepIndex, totalSteps, updatedAt: Date.now() };
    await AsyncStorage.setItem(storageKey(recipeId), JSON.stringify(value));
  } catch (e) {
    console.warn("[cookSession] yazılamadı", e);
  }
}

export async function clearCookSession(recipeId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(recipeId));
  } catch (e) {
    console.warn("[cookSession] silinemedi", e);
  }
}

export async function getCookSession(recipeId: string): Promise<CookSession | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(recipeId));
    if (!raw) return null;
    return JSON.parse(raw) as CookSession;
  } catch (e) {
    console.warn("[cookSession] okunamadı", e);
    return null;
  }
}
