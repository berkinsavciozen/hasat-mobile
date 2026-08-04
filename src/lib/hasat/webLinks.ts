// P23-M6-ek'te "Sipariş Ver" burada tanımlı `buyerProductUrl` ile web'e dışarı
// link veriyordu; P23-M7-a'da teklif oluşturma native'e taşındığı için o
// fonksiyon kaldırıldı (kullanan tek yer değişti, bkz. app/recipe/[slug].tsx).
// `WEB_APP_URL` kalıyor — mobil v1'de hâlâ native olmayan iki köprü noktası
// için gerekecek (TODO.md'ye açık madde olarak yazıldı):
//   - Pazarlık yanıtı (karşı teklif): bu turda mobil ekran yok, çiftçi karşı
//     teklif verirse alıcı web'e yönlendirilecek — M8 sonrası.
//   - Sipariş takibi: bu turda mobil ekran yok (Berkin kararı) — "web'de
//     devam et" yönlendirmesi M9 maddesi.
export const WEB_APP_URL = "https://hasat.lovable.app";
