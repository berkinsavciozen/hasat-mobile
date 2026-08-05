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
          "id, status, ball_side, payment_status, current_quantity, quantity, current_price, price_per_unit, created_at, farmer:profiles!offers_farmer_id_fkey(name), listing:listings(crop,unit)",
        )
        .eq("buyer_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        crop: r.listing?.crop ?? "—",
        unit: r.listing?.unit ?? "kg",
        quantity: Number(r.current_quantity ?? r.quantity),
        pricePerUnit: Number(r.current_price ?? r.price_per_unit),
        status: r.status === "pending_farmer" || r.status === "pending_buyer" ? "pending" : r.status,
        ballSide: (r.ball_side === "buyer" ? "buyer" : "farmer") as BallSide,
        paymentStatus: (r.payment_status ?? "unpaid") as PaymentStatus,
        createdAt: r.created_at,
        farmerName: r.farmer?.name ?? null,
      }));
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
          "id, order_ref, status, created_at, offer:offers(quantity, price_per_unit, listing:listings(crop, unit)), farmer:profiles!orders_farmer_id_fkey(name)",
        )
        .eq("buyer_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => {
        const qty = Number(r.offer?.quantity ?? 0);
        const price = Number(r.offer?.price_per_unit ?? 0);
        return {
          id: r.id,
          code: r.order_ref,
          crop: r.offer?.listing?.crop ?? "—",
          unit: r.offer?.listing?.unit ?? "kg",
          quantity: qty,
          pricePerUnit: price,
          total: qty * price,
          status: r.status,
          createdAt: r.created_at,
          farmerName: r.farmer?.name ?? null,
        };
      });
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
