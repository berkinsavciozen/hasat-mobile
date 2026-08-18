// Web'in `src/lib/hasat/notif-events.ts`'inin birebir mobil karşılığı — aynı
// 16 event, aynı roller, aynı kanallar, aynı başlıklar (F3'ün notify_*
// fonksiyonlarındaki gerçek in-app başlıklarla tutarlı, Supabase MCP ile
// pg_get_functiondef üzerinden doğrulandı, efuqpiaavrzimvstpdpm). Kaynak tek
// bir yerde yaşamıyor (hasat-core'a taşınmadı — bkz. diğer dosyaların aynı
// "ilk turu küçük tut" kararı), iki dosya elle eşit tutuluyor.
//
// community_push ve price_alert_* kolonları F3 migration round 2'de düşürüldü.
//
// crop_request_match İKİ yönlü: notify_crop_request_fulfilled (DB trigger,
// yeni aktif listing) pending crop_requests.requested_by'a (her zaman buyer)
// push+sms yazıyor; useCreateCropRequest (talep oluşturma anı, hem web hem
// mobil) mevcut ilan/parsel eşleşen ÇİFTÇİLERE sms yazıyor (push yok). Yani
// hem farmer hem buyer bu toggle'a bağlı bildirim alabiliyor.
export type NotifChannel = "whatsapp" | "push" | "sms";
export type NotifRole = "farmer" | "buyer";

export interface NotifPrefsRow {
  new_offer_whatsapp: boolean;
  new_offer_push: boolean;
  new_offer_sms: boolean;
  offer_accepted_push: boolean;
  offer_accepted_sms: boolean;
  offer_countered_push: boolean;
  offer_rejected_push: boolean;
  offer_rejected_sms: boolean;
  payment_confirmed_push: boolean;
  payment_confirmed_sms: boolean;
  order_preparing_push: boolean;
  order_preparing_sms: boolean;
  order_shipped_push: boolean;
  order_shipped_sms: boolean;
  order_delivered_push: boolean;
  order_delivered_sms: boolean;
  order_cancelled_push: boolean;
  order_cancelled_sms: boolean;
  dispute_opened_push: boolean;
  dispute_opened_sms: boolean;
  order_completed_push: boolean;
  order_completed_sms: boolean;
  crop_request_match_push: boolean;
  crop_request_match_sms: boolean;
  harvest_time_whatsapp: boolean;
  harvest_time_push: boolean;
  harvest_time_sms: boolean;
  subscription_new_push: boolean;
  subscription_new_sms: boolean;
  subscription_accepted_push: boolean;
  subscription_accepted_sms: boolean;
  subscription_rejected_push: boolean;
  subscription_rejected_sms: boolean;
}

export type NotifPrefKey = keyof NotifPrefsRow;

// Kolon varsayılanları: information_schema.columns.column_default (Supabase
// MCP ile doğrudan sorgulandı) ile birebir.
export const NOTIF_PREF_DEFAULTS: NotifPrefsRow = {
  new_offer_whatsapp: true,
  new_offer_push: true,
  new_offer_sms: false,
  offer_accepted_push: true,
  offer_accepted_sms: false,
  offer_countered_push: true,
  offer_rejected_push: true,
  offer_rejected_sms: false,
  payment_confirmed_push: true,
  payment_confirmed_sms: false,
  order_preparing_push: true,
  order_preparing_sms: false,
  order_shipped_push: true,
  order_shipped_sms: false,
  order_delivered_push: true,
  order_delivered_sms: false,
  order_cancelled_push: true,
  order_cancelled_sms: false,
  dispute_opened_push: true,
  dispute_opened_sms: false,
  order_completed_push: true,
  order_completed_sms: false,
  crop_request_match_push: true,
  crop_request_match_sms: false,
  harvest_time_whatsapp: true,
  harvest_time_push: true,
  harvest_time_sms: false,
  subscription_new_push: true,
  subscription_new_sms: true,
  subscription_accepted_push: true,
  subscription_accepted_sms: true,
  subscription_rejected_push: true,
  subscription_rejected_sms: true,
};

export interface NotifEventDef {
  key: string;
  label: string;
  roles: NotifRole[];
  cols: Partial<Record<NotifChannel, NotifPrefKey>>;
  /** Kolon DB'de var ama hiçbir yerde dispatch_whatsapp yok — toggle işlevsiz, gri/devre dışı gösterilmeli. */
  whatsappComingSoon?: boolean;
}

export const NOTIF_EVENTS: NotifEventDef[] = [
  {
    key: "new_offer",
    label: "Yeni Teklif",
    roles: ["farmer"],
    cols: { whatsapp: "new_offer_whatsapp", push: "new_offer_push", sms: "new_offer_sms" },
    whatsappComingSoon: true,
  },
  {
    key: "offer_accepted",
    label: "Teklifiniz Kabul Edildi",
    roles: ["farmer", "buyer"],
    cols: { push: "offer_accepted_push", sms: "offer_accepted_sms" },
  },
  {
    key: "offer_countered",
    label: "Karşı Teklif",
    roles: ["farmer", "buyer"],
    cols: { push: "offer_countered_push" },
  },
  {
    key: "offer_rejected",
    label: "Teklif Reddedildi",
    roles: ["buyer"],
    cols: { push: "offer_rejected_push", sms: "offer_rejected_sms" },
  },
  {
    key: "payment_confirmed",
    label: "Ödeme Alındı",
    roles: ["farmer"],
    cols: { push: "payment_confirmed_push", sms: "payment_confirmed_sms" },
  },
  {
    key: "order_preparing",
    label: "Siparişiniz Hazırlanıyor",
    roles: ["buyer"],
    cols: { push: "order_preparing_push", sms: "order_preparing_sms" },
  },
  {
    key: "order_shipped",
    label: "Siparişiniz Kargoya Verildi",
    roles: ["buyer"],
    cols: { push: "order_shipped_push", sms: "order_shipped_sms" },
  },
  {
    key: "order_delivered",
    label: "Siparişiniz Teslim Edildi",
    roles: ["buyer"],
    cols: { push: "order_delivered_push", sms: "order_delivered_sms" },
  },
  {
    key: "order_cancelled",
    label: "Sipariş İptal Edildi",
    roles: ["farmer", "buyer"],
    cols: { push: "order_cancelled_push", sms: "order_cancelled_sms" },
  },
  {
    key: "dispute_opened",
    label: "Siparişte İhtilaf Açıldı",
    roles: ["farmer", "buyer"],
    cols: { push: "dispute_opened_push", sms: "dispute_opened_sms" },
  },
  {
    key: "order_completed",
    label: "Sipariş Tamamlandı",
    roles: ["buyer"],
    cols: { push: "order_completed_push", sms: "order_completed_sms" },
  },
  {
    key: "crop_request_match",
    label: "Ürün Talebi Eşleşti",
    roles: ["farmer", "buyer"],
    cols: { push: "crop_request_match_push", sms: "crop_request_match_sms" },
  },
  {
    key: "harvest_time",
    label: "Hasat Yaklaşıyor",
    roles: ["farmer", "buyer"],
    cols: { whatsapp: "harvest_time_whatsapp", push: "harvest_time_push", sms: "harvest_time_sms" },
    whatsappComingSoon: true,
  },
  {
    key: "subscription_new",
    label: "Yeni Abonelik Talebi",
    roles: ["farmer"],
    cols: { push: "subscription_new_push", sms: "subscription_new_sms" },
  },
  {
    key: "subscription_accepted",
    label: "Aboneliğiniz Aktif",
    roles: ["buyer"],
    cols: { push: "subscription_accepted_push", sms: "subscription_accepted_sms" },
  },
  {
    key: "subscription_rejected",
    label: "Abonelik Reddedildi",
    roles: ["buyer"],
    cols: { push: "subscription_rejected_push", sms: "subscription_rejected_sms" },
  },
];

export function notifEventsForRole(role: NotifRole): NotifEventDef[] {
  return NOTIF_EVENTS.filter((e) => e.roles.includes(role));
}

export const NOTIF_CHANNELS: { key: NotifChannel; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
  { key: "sms", label: "SMS" },
];
