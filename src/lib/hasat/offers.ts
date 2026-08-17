// P23-M7-a — mobilde teklif oluşturma. Stratejik karar (Berkin, 2026-08-04):
// mobil bir marketplace uygulaması, teklif oluşturma web'e devredilmiyor.
//
// Kural #106 uygulaması: çoklu-parti teklif orkestrasyonu (offers INSERT +
// offer_items INSERT, en az 1 item invariant'ı) artık `rpc_create_offer`
// (hasat-vault/Build/Shared-Architecture.md → "Katman 1") tek bir DB
// transaction'ında yaşıyor — web de (P23-M7-a'da) aynı RPC'ye geçirildi, bu
// dosya web'in `useCreateOffer`/`useCreateMultiBatchOffer`'ının (client-taraf
// iki-adımlı insert) mobil karşılığı DEĞİL: mobil hiçbir zaman iki-adımlı
// insert'i kendi başına yazmadı, doğrudan RPC'yi çağırıyor.
//
// Ürün sorgu şekli (`useFarmerCropListings`, `useListingStock`) web'in
// `hasat-d2c-marketplace/src/lib/hasat/queries.ts`'indeki aynı adlı
// hook'larının birebir portu — aynı tablo, aynı kolonlar, aynı stok hesabı
// (DB-Schema.md → "Stok hesaplama"). `useListingStock`, `enforce_offer_stock`
// trigger'ının kullandığı batch_total>0 fallback'ini display amaçlı
// tekrarlıyor — web'deki gibi `offers.quantity` (offer_items değil) üzerinden
// rezervasyon sayıyor; bu web'in de bugün kullandığı bir yaklaşıklık (çoklu
// parti teklifte per-listing değil toplam miktar sayar), burada "düzeltilmedi"
// çünkü kapsam web/mobil TUTARLILIĞI, web'in kendi ekranını sessizce
// değiştirmek değil. Asıl doğruluk kaynağı zaten sunucu tarafı: `rpc_create_offer`
// kendi iç kontrolünde `offer_items` üzerinden doğru (per-listing) hesabı yapıyor.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface FarmerCropListing {
  id: string;
  crop: string;
  unit: string;
  pricePerUnit: number;
  minOrder: number;
  quantity: number;
  batchName: string | null;
  quality: string | null;
  farmerId: string;
  farmerName: string;
  farmerCity: string | null;
  photoUrls: string[];
}

export function useFarmerCropListings(farmerId: string | undefined, crop: string | undefined) {
  return useQuery({
    queryKey: ["farmerCropListings", farmerId, crop?.toLowerCase()],
    enabled: !!farmerId && !!crop,
    queryFn: async (): Promise<FarmerCropListing[]> => {
      const [{ data, error }, { data: profile }] = await Promise.all([
        supabase
          .from("listings")
          .select("id, crop, unit, price_per_unit, min_order, quantity, batch_name, quality, farmer_id, photo_urls")
          .eq("farmer_id", farmerId!)
          .eq("status", "active")
          .ilike("crop", crop!)
          .order("created_at", { ascending: true }),
        supabase.from("public_farmer_profiles").select("id, name, city").eq("id", farmerId!).maybeSingle(),
      ]);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        crop: r.crop,
        unit: r.unit,
        pricePerUnit: Number(r.price_per_unit),
        minOrder: Number(r.min_order),
        quantity: Number(r.quantity),
        batchName: r.batch_name ?? null,
        quality: r.quality ?? null,
        farmerId: r.farmer_id,
        farmerName: profile?.name ?? "Üretici",
        farmerCity: profile?.city ?? null,
        photoUrls: r.photo_urls ?? [],
      }));
    },
  });
}

/** P21-A'nın "mixed-unit toplama riski" bulgusunun mobil karşılığı — aynı crop
 * için farklı ilanlar farklı birimde olabilir (bkz. güncel veri: safran'ın
 * 15g/500g/100kg partileri). Web'in `buyer.product.$farmerId.$crop.tsx`'i
 * `crop_config.default_unit`'i kanonik birim olarak kullanıp `convertQuantity`
 * ile topluyor — burada aynı desen. */
export function useCropCanonicalUnit(crop: string | undefined, fallback: string | undefined) {
  return useQuery({
    queryKey: ["cropCanonicalUnit", crop],
    enabled: !!crop,
    queryFn: async (): Promise<string> => {
      const { data } = await supabase.from("crop_config").select("default_unit").eq("crop", crop!).maybeSingle();
      return data?.default_unit ?? fallback ?? "kg";
    },
  });
}

export interface ListingStock {
  base: number;
  reserved: number;
  available: number;
}

export function useListingStock(listingId: string | undefined | null) {
  return useQuery({
    queryKey: ["listingStock", listingId],
    enabled: !!listingId,
    queryFn: async (): Promise<ListingStock> => {
      const [links, listingRes, offersRes] = await Promise.all([
        supabase
          .from("listing_harvest_entries")
          .select("harvest_entry_id, harvest_entries(quantity)")
          .eq("listing_id", listingId!),
        supabase.from("listings").select("quantity").eq("id", listingId!).maybeSingle(),
        supabase.from("offers").select("quantity").eq("listing_id", listingId!).eq("status", "accepted"),
      ]);
      if (links.error) throw links.error;
      if (listingRes.error) throw listingRes.error;
      if (offersRes.error) throw offersRes.error;
      const batchSum = (links.data ?? []).reduce(
        (s, r) => s + Number(r.harvest_entries?.quantity ?? 0),
        0,
      );
      const base = batchSum > 0 ? batchSum : Number(listingRes.data?.quantity ?? 0);
      const reserved = (offersRes.data ?? []).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
      return { base, reserved, available: Math.max(0, base - reserved) };
    },
  });
}

// Web'in `DeliveryFields`'ındaki (hasat-d2c-marketplace/src/components/hasat/DeliveryFields.tsx)
// aynı üç seçenek, aynı sıra, aynı etiket/açıklama. Web `deliveryToDb()` ile
// serbest metin id'lerden (`"Kargo (Alıcı Öder)"` gibi) enum'a bulanık
// eşleştirme yapıyor (tarihsel — id'ler UI kopyasıyla aynı büyüdü); burada
// yeni bir ekran olduğu için o dolaylamaya gerek yok, id doğrudan
// `delivery_type` enum değeri — davranış birebir aynı, kod daha basit.
export const DELIVERY_OPTIONS = [
  { id: "kargo-seller", label: "Kargo", desc: "3-5 iş günü" },
  { id: "kargo-buyer", label: "Aynı Gün Kurye", desc: "Sadece İstanbul" },
  { id: "elden", label: "Üreticiden Teslim", desc: "Çiftlikten alın" },
] as const;

export const DELIVERY_DATE_PRESETS = [
  { days: 3, label: "3 gün sonra" },
  { days: 7, label: "1 hafta sonra" },
  { days: 14, label: "2 hafta sonra" },
  { days: 30, label: "1 ay sonra" },
] as const;

export function offsetToIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface OfferItemInput {
  listingId: string;
  quantity: number;
  pricePerUnit: number;
}

export interface CreateOfferInput {
  farmerId: string;
  items: OfferItemInput[];
  delivery: string;
  deliveryDate: string;
  note: string | null;
  /** Bu teklif bir tarif malzeme kartından ("Sipariş Ver") doğduysa o tarifin
   * ID'si — `offers.source_recipe_id`'e yazılır, huni atfının (`v_kpi_recipe_funnel`)
   * mobil kaynaklı kanıtı (P23-M8-c2/T3). */
  sourceRecipeId?: string;
}

export interface CreatedOffer {
  id: string;
  farmer_id: string;
  listing_id: string;
  quantity: number;
  price_per_unit: number;
}

export function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOfferInput): Promise<CreatedOffer> => {
      if (!input.items.length) throw new Error("En az bir parti seçmelisiniz");
      // Args tipi p_note/p_subscription_id/p_source_recipe_id için
      // `string | undefined` (SQL tarafı `default null`) — web'deki
      // `insertOfferWithItems`'la aynı desen (queries.ts).
      const { data, error } = await supabase.rpc("rpc_create_offer", {
        p_farmer_id: input.farmerId,
        p_items: input.items.map((i) => ({
          listing_id: i.listingId,
          quantity: i.quantity,
          price_per_unit: i.pricePerUnit,
        })),
        p_delivery: input.delivery,
        p_delivery_date: input.deliveryDate,
        p_note: input.note ?? undefined,
        p_subscription_id: undefined,
        p_source_recipe_id: input.sourceRecipeId ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["farmerCropListings", vars.farmerId] });
      for (const i of vars.items) qc.invalidateQueries({ queryKey: ["listingStock", i.listingId] });
    },
  });
}

/** Seçili partilerden (listingId -> miktar) `rpc_create_offer` girdisine
 * çevirir, `pricePerUnit`'i ilan listesinden çözer. */
export function useOfferItems(
  listings: FarmerCropListing[],
  selected: Record<string, number>,
): OfferItemInput[] {
  return useMemo(
    () =>
      Object.entries(selected)
        .filter(([, q]) => q > 0)
        .map(([listingId, quantity]) => {
          const l = listings.find((x) => x.id === listingId);
          return { listingId, quantity, pricePerUnit: l?.pricePerUnit ?? 0 };
        }),
    [listings, selected],
  );
}
