// `expo-network`'ün resmi `useNetworkState()` hook'u üzerine ince bir katman.
// Neden `@react-native-community/netinfo` değil: proje zaten her native
// yeteneği `expo-*` paketleriyle karşılıyor (bkz. package.json) — aynı SDK
// sürümüne (57.x) pinlenen resmi bir Expo paketi, EAS build'de ekstra
// native-modül uyumluluk riski taşımıyor (build kotası kısıtlı, bkz.
// hasat-vault/Build/P23-Mobile.md → M5-a-ek-2 "Kota koruması").
import { useNetworkState } from "expo-network";

/**
 * `isConnected===undefined` ilk render'da (durum henüz okunmadan) veya web'de
 * oluşur — bu durumda "offline" varsaymıyoruz (yanlış negatif, gereksiz
 * bir offline şeridi/boş ekran göstermemek için "bilinmiyorsa online say").
 * `isInternetReachable===false` (bağlı ama gerçek internet yok — örn. captive
 * portal) de offline sayılıyor: RPC/insert zaten başarısız olacak.
 */
export function useIsOffline(): boolean {
  const state = useNetworkState();
  if (state.isConnected === undefined) return false;
  if (!state.isConnected) return true;
  return state.isInternetReachable === false;
}
