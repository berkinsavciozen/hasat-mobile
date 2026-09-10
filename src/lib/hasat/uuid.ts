// RFC4122 v4 üretimi `crypto.randomUUID()` yerine `crypto.getRandomValues` ile
// elle kuruluyor: Hermes'te `randomUUID` her zaman yok ama
// `react-native-get-random-values` (large-secure-store.ts üzerinden zaten
// bootstrap ediliyor) `getRandomValues`'ı garanti ediyor — yeni bir bağımlılık
// eklemeden üretilebiliyor. Önceden yalnızca session.ts içindeydi (anon ziyaretçi
// id'si); T6 (customize-recipe idempotency_key) de aynı üretime ihtiyaç duyduğu
// için buraya çıkarıldı.
import "react-native-get-random-values";

export function uuidv4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
