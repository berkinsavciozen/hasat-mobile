// P23-M6-ek — mobil v1'de checkout yok (Guideline 2.1); "Sipariş Ver" bu
// yüzden web'in mevcut ürün sayfasına açılır (marketplace köprüsünün tamamı
// M7 — burada yeni bir native ürün/keşfet ekranı KURULMADI, yalnızca doğru
// yere link verildi, bkz. Build/P23-Mobile.md → "P23-M6-ek").
export const WEB_APP_URL = "https://hasat.lovable.app";

export function buyerProductUrl(farmerId: string, crop: string): string {
  return `${WEB_APP_URL}/buyer/product/${encodeURIComponent(farmerId)}/${encodeURIComponent(crop)}`;
}
