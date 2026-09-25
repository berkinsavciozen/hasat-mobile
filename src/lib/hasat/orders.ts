// P23-M7-d — Siparişler ekranı (salt okunur). Berkin kararı (görev metni):
// yalnızca kendi teklif/sipariş listesi + durumları görünsün; pazarlık
// yanıtı (karşı teklife cevap) YOK, ödeme YOK — "web'de devam et"
// yönlendirmesi kalıyor (webLinks.ts → WEB_APP_URL).
//
// Sorgu şekli ve `statusVisual` etiket mantığı web'in `useBuyerOffers`/
// `useBuyerOrders`/`offer-status.ts`'inin (hasat-d2c-marketplace/src/lib/hasat/)
// birebir portu — yeni bir durum makinesi icat edilmedi (kural #106), sadece
// aksiyon butonları (Kabul Et/Karşı Teklif/Reddet/Ödemeyi Tamamla) çıkarıldı
// çünkü bu ekran salt okunur.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export type BallSide = "farmer" | "buyer";
export type PaymentStatus = "unpaid" | "pending" | "pending_transfer" | "paid";

export interface BuyerOfferRow {
  id: string;
  crop: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
  status: string;
  ballSide: BallSide;
  paymentStatus: PaymentStatus;
  createdAt: string;
  farmerName: string | null;
  farmerCity: string | null;
  delivery: string | null;
  deliveryDate: string | null;
  note: string | null;
}

export interface BuyerOrderRow {
  id: string;
  code: string;
  crop: string;
  unit: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
  status: string;
  createdAt: string;
  farmerName: string | null;
}

// FIN-3-M — Parasal snapshot paritesi. FIN-3 (21 Eylül) `offers`'a değişmez
// kolonlar ekledi: `snapshot_crop`/`snapshot_unit` (insert anında listing'den
// kopya) ve `final_price_per_unit`/`final_quantity` (accepted anında bir kez).
// Web'in `dbToOffer`/`dbToOrder`'ı ile birebir aynı öncelik:
//   ürün/birim  = snapshot_* ?? canlı listing join ?? varsayılan
//   miktar      = final_quantity ?? current_quantity ?? quantity
//   birim fiyat = final_price_per_unit ?? current_price ?? price_per_unit
// Listing join'i yalnız snapshot'ı null olan eski satırlar için fallback.
// Karşı teklifin geri çekilmesi `quantity`/`price_per_unit`'i geri çekilen
// değerde bırakıyor — o yüzden sipariş tutarı ASLA yalnız orijinal alanlardan
// okunmamalı.
function num(...values: unknown[]): number {
  for (const v of values) {
    if (v !== null && v !== undefined) return Number(v);
  }
  return 0;
}

function agreedTerms(o: any) {
  return {
    crop: (o?.snapshot_crop ?? o?.listing?.crop ?? "—") as string,
    unit: (o?.snapshot_unit ?? o?.listing?.unit ?? "kg") as string,
    quantity: num(o?.final_quantity, o?.current_quantity, o?.quantity),
    pricePerUnit: num(o?.final_price_per_unit, o?.current_price, o?.price_per_unit),
  };
}

export function mapBuyerOfferRow(r: any): BuyerOfferRow {
  const terms = agreedTerms(r);
  return {
    id: r.id,
    crop: terms.crop,
    unit: terms.unit,
    quantity: terms.quantity,
    pricePerUnit: terms.pricePerUnit,
    status: r.status === "pending_farmer" || r.status === "pending_buyer" ? "pending" : r.status,
    ballSide: (r.ball_side === "buyer" ? "buyer" : "farmer") as BallSide,
    paymentStatus: (r.payment_status ?? "unpaid") as PaymentStatus,
    createdAt: r.created_at,
    farmerName: r.farmer?.name ?? null,
    farmerCity: r.farmer?.city ?? null,
    delivery: r.delivery ?? null,
    deliveryDate: r.delivery_date ?? null,
    note: r.note ?? null,
  };
}

export function mapBuyerOrderRow(r: any): BuyerOrderRow {
  const terms = agreedTerms(r.offer);
  return {
    id: r.id,
    code: r.order_ref,
    crop: terms.crop,
    unit: terms.unit,
    quantity: terms.quantity,
    pricePerUnit: terms.pricePerUnit,
    total: terms.quantity * terms.pricePerUnit,
    status: r.status,
    createdAt: r.created_at,
    farmerName: r.farmer?.name ?? null,
  };
}

export function useBuyerOffers() {
  return useQuery({
    queryKey: ["buyerOffersReadonly"],
    queryFn: async (): Promise<BuyerOfferRow[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("offers")
        .select(
          "id, status, ball_side, payment_status, current_quantity, quantity, current_price, price_per_unit, final_quantity, final_price_per_unit, snapshot_crop, snapshot_unit, delivery, delivery_date, note, created_at, farmer:profiles!offers_farmer_id_fkey(name,city), listing:listings(crop,unit)",
        )
        .eq("buyer_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapBuyerOfferRow);
    },
  });
}

export function useBuyerOrders() {
  return useQuery({
    queryKey: ["buyerOrdersReadonly"],
    queryFn: async (): Promise<BuyerOrderRow[]> => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_ref, status, created_at, offer:offers(quantity, price_per_unit, current_quantity, current_price, final_quantity, final_price_per_unit, snapshot_crop, snapshot_unit, listing:listings(crop, unit)), farmer:profiles!orders_farmer_id_fkey(name)",
        )
        .eq("buyer_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapBuyerOrderRow);
    },
  });
}

export interface StatusLabel {
  label: string;
  className: string;
}

/** Web'in `offer-status.ts` → `statusVisual`'ının birebir portu (etiket
 * mantığı aynı, aksiyon-yeteneği fonksiyonları — canAccept/canCounter/
 * canReject — bu ekranda kullanılmadığı için taşınmadı). */
export function offerStatusLabel(offer: BuyerOfferRow): StatusLabel {
  const ball = offer.ballSide;
  const pay = offer.paymentStatus;
  if (offer.status === "rejected") return { label: "Reddedildi", className: "text-hred" };
  if (offer.status === "completed") return { label: "Tamamlandı", className: "text-hmuted" };
  if (offer.status === "active" || (offer.status === "accepted" && pay === "paid")) {
    return { label: "Aktif", className: "text-sage" };
  }
  if (offer.status === "accepted") {
    return { label: "Ödeme Bekleniyor (web'de tamamlanır)", className: "text-gold" };
  }
  if (offer.status === "counter") {
    return ball === "buyer"
      ? { label: "Yanıtınız Bekleniyor — web'de devam edin", className: "text-saffron" }
      : { label: "Çiftçi Yanıtı Bekleniyor", className: "text-hmuted" };
  }
  return ball === "buyer"
    ? { label: "Yanıtınız Bekleniyor — web'de devam edin", className: "text-saffron" }
    : { label: "Çiftçi Yanıtı Bekleniyor", className: "text-hmuted" };
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim Edildi",
  completed: "Tamamlandı",
  disputed: "İhtilaflı",
  cancelled: "İptal Edildi",
};
