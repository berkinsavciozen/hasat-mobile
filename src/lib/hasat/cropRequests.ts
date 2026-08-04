// P23-M6-ek — "Talep Et" (crop_requests) mobil karşılığı.
//
// Web'deki `useCreateCropRequest` (hasat-d2c-marketplace/src/lib/hasat/queries.ts)
// ile BİREBİR aynı adımlar: crop_requests insert → (varsa) recipe_rfq_links
// insert → best-effort çiftçi eşleştirme + bildirim + dispatch_sms. Bu mantık
// kural #106'nın istediği gibi DB'de yaşamıyor (web'de de yaşamıyor — mevcut,
// önceden onaylanmış bir mimari borcu, bu turun kapsamı değil); mobil bunu
// YENİDEN İCAT etmiyor, web'in attığı adımları birebir port ediyor ki iki
// client aynı davranışı üretsin. Web'in kendi kodu da (aynı sebeple:
// `crop_requests`/`ingredient_class` gibi kolonlar üretilmiş tipte henüz yok)
// `(supabase as any)` kullanıyor — burada da aynı, tutarlı desen izleniyor.
//
// P23-M6-ek'te YENİ olan tek şey: `ingredient_class` — talep tarif malzeme
// kartından açıldıysa kaynağın sınıflandırması (tarımsal/platform_disi)
// crop_requests satırına da yazılıyor (bkz. Build/DB-Schema.md → "P23-M6-ek",
// admin ısı haritasının iki sinyali ayırabilmesi için).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { IngredientClass } from "@/lib/hasat/import";

const sb = supabase as any;

export interface CreateCropRequestInput {
  cropName: string;
  note?: string | null;
  quantity?: number | null;
  unit?: string | null;
  region?: string | null;
  targetDateStart?: string | null;
  targetDateEnd?: string | null;
  targetPrice?: number | null;
  /** Talep bir tarifin malzeme kartından açıldıysa huni atfı için. */
  recipeId?: string;
  /** P23-M6-ek: kaynak malzemenin sınıflandırması — admin ısı haritası sinyali. */
  ingredientClass?: IngredientClass | null;
}

export function useCreateCropRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCropRequestInput) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Oturum bulunamadı");
      const cropName = input.cropName.trim();
      if (!cropName) throw new Error("Ürün adı gerekli");

      const { data: inserted, error } = await sb
        .from("crop_requests")
        .insert({
          requested_by: userId,
          crop_name_free_text: cropName,
          note: input.note?.trim() || null,
          quantity: input.quantity ?? null,
          unit: input.unit?.trim() || null,
          region: input.region?.trim() || null,
          target_date_start: input.targetDateStart || null,
          target_date_end: input.targetDateEnd || null,
          target_price: input.targetPrice ?? null,
          ingredient_class: input.ingredientClass ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const requestId = inserted.id as string;

      if (input.recipeId) {
        const { error: linkError } = await sb
          .from("recipe_rfq_links")
          .insert({ recipe_id: input.recipeId, crop_request_id: requestId });
        if (linkError) console.error("[recipe_rfq_links] insert failed", linkError);
      }

      // Best-effort eşleştirme + bildirimler. Talep her koşulda kaydedilmiş
      // sayılır, bu blok asla mutasyonu başarısız yapmaz (web'le aynı desen).
      try {
        const { data: cfg } = await sb
          .from("crop_config")
          .select("crop, display_name")
          .or(`crop.ilike.${cropName},display_name.ilike.${cropName}`)
          .limit(1)
          .maybeSingle();
        const canonical: string = cfg?.crop ?? cfg?.display_name ?? cropName;

        if (!cfg) {
          const noteSnippet = input.note?.trim()
            ? ` · Not: ${input.note.trim().slice(0, 80)}${input.note.trim().length > 80 ? "..." : ""}`
            : "";
          sb.functions
            .invoke("notify-admin", {
              body: { message: `🛒 Katalogda olmayan ürün talebi: "${cropName}"${noteSnippet} (buyer, mobil)` },
            })
            .catch((e: unknown) => console.warn("notify-admin (catalog gap) failed", e));
        }

        const farmerIds = new Set<string>();
        const { data: listingRows } = await sb
          .from("listings")
          .select("farmer_id, crop, status")
          .in("status", ["active", "draft"])
          .ilike("crop", canonical);
        for (const r of listingRows ?? []) {
          if (r?.farmer_id) farmerIds.add(r.farmer_id);
        }

        const { data: parcelRows } = await sb
          .from("parcels")
          .select("farmer_id, crops")
          .contains("crops", [canonical]);
        for (const r of parcelRows ?? []) {
          if (r?.farmer_id) farmerIds.add(r.farmer_id);
        }

        let matched = Array.from(farmerIds);
        if (input.region?.trim() && matched.length > 0) {
          const { data: profs } = await sb
            .from("profiles")
            .select("id, city")
            .in("id", matched)
            .eq("city", input.region.trim());
          matched = (profs ?? []).map((p: { id: string }) => p.id);
        }

        if (matched.length > 0) {
          const { data: me } = await sb.from("profiles").select("name").eq("id", userId).maybeSingle();
          const buyerName = (me?.name as string | undefined) || "Bir alıcı";
          const qtyLabel = input.quantity != null && input.unit ? ` — ${input.quantity} ${input.unit}` : "";
          const regionLabel = input.region?.trim() ? ` · ${input.region.trim()}` : "";
          const body = `${buyerName} ${cropName} arıyor${qtyLabel}${regionLabel}`;
          const rows = matched.map((fid) => ({
            user_id: fid,
            type: "crop_request",
            title: "Yeni ürün talebi",
            body,
            related_id: requestId,
          }));
          await sb.from("notifications").insert(rows);

          await Promise.all(
            matched.map((fid) =>
              sb
                .rpc("dispatch_sms", {
                  _user_id: fid,
                  _event: "crop_request_match",
                  _message: `Hasat: ${buyerName} ${cropName} arıyor${qtyLabel}${regionLabel}`,
                })
                .then(
                  () => {},
                  (e: unknown) => console.warn("crop_request sms failed", fid, e),
                ),
            ),
          );
        }
      } catch (e) {
        console.warn("crop_request notify failed", e);
      }

      return { id: requestId as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cropRequests"] });
      qc.invalidateQueries({ queryKey: ["myCropRequests"] });
    },
  });
}
