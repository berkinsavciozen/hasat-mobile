// P23-M7-a — ürün/parti detay ekranı, tarif malzeme kartındaki "Sipariş Ver"in
// hedefi (bkz. app/recipe/[slug].tsx). M6-ek'te bu buton web'in
// `buyer.product.$farmerId.$crop` sayfasına dışarı link veriyordu ("mobilde
// checkout yok" kararı teklif OLUŞTURMAYı da web'e itiyordu); stratejik karar
// bu turda değişti (Build/P23-Mobile.md → "Stratejik karar 2026-08-04") —
// teklif oluşturma artık native, ödeme hâlâ yok. Alanlar web'in
// `buyer.product.$farmerId.$crop.tsx` sayfasıyla aynı: partiler (çoklu-parti
// tek teklif), miktar, teslimat, teslim tarihi, not.
import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { formatTRY, formatCropIngredient, formatQuantity } from "@/lib/hasat/format";
import { convertQuantity } from "@/lib/core";
import {
  useFarmerCropListings,
  useListingStock,
  useCreateOffer,
  useOfferItems,
  useCropCanonicalUnit,
  DELIVERY_OPTIONS,
  DELIVERY_DATE_PRESETS,
  offsetToIsoDate,
  type FarmerCropListing,
} from "@/lib/hasat/offers";
import { useCropDefaultPhoto, resolveListingPhoto } from "@/lib/hasat/crop-photo";
import { cropEmoji } from "@/lib/hasat/crop-emoji";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";

export default function ProductScreen() {
  const insets = useSafeAreaInsets();
  const { farmerId, crop } = useLocalSearchParams<{ farmerId: string; crop: string }>();
  const { data: listings = [], isLoading } = useFarmerCropListings(farmerId, crop);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [delivery, setDelivery] = useState<string>(DELIVERY_OPTIONS[0].id);
  const [deliveryDays, setDeliveryDays] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createOffer = useCreateOffer();

  const items = useOfferItems(listings, selected);
  const { data: canonicalUnit = listings[0]?.unit ?? "kg" } = useCropCanonicalUnit(crop, listings[0]?.unit);
  const { data: cropDefaultPhoto = null } = useCropDefaultPhoto(crop);
  const totalQty = items.reduce((s, i) => {
    const l = listings.find((x) => x.id === i.listingId);
    return s + convertQuantity(i.quantity, l?.unit ?? canonicalUnit, canonicalUnit);
  }, 0);
  const totalPrice = items.reduce((s, i) => s + i.quantity * i.pricePerUnit, 0);
  const belowMinListingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of items) {
      const l = listings.find((x) => x.id === i.listingId);
      if (l && i.quantity < l.minOrder) ids.add(l.id);
    }
    return ids;
  }, [items, listings]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  if (listings.length === 0) {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-sm text-hmuted">
          Bu üreticinin bu üründe aktif partisi yok.
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-xs text-saffron underline">← Geri</Text>
        </Pressable>
      </View>
    );
  }

  const first = listings[0];
  const canSubmit = items.length > 0 && deliveryDays != null && belowMinListingIds.size === 0;
  const realPhoto = listings.find((l) => l.photoUrls.length > 0)?.photoUrls[0] ?? null;
  const { photoUrl, isRepresentative } = resolveListingPhoto(realPhoto ? [realPhoto] : [], cropDefaultPhoto);

  const submit = async () => {
    setSubmitError(null);
    if (!canSubmit || deliveryDays == null) return;
    try {
      await createOffer.mutateAsync({
        farmerId: farmerId!,
        items,
        delivery,
        deliveryDate: offsetToIsoDate(deliveryDays),
        note: note.trim() || null,
      });
      router.replace({ pathname: "/offer/confirm", params: { crop: first.crop } });
    } catch (e: any) {
      setSubmitError(e?.message ?? "Teklif gönderilemedi");
    }
  };

  return (
    <View className="flex-1 bg-dark">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 200 }}>
        <View className="px-5">
          <Pressable onPress={() => router.back()}>
            <Text className="text-xs text-hmuted">← Geri</Text>
          </Pressable>
          <Text className="mt-2 font-serif text-2xl font-bold text-hwhite">
            {formatCropIngredient(first.crop)}
          </Text>
          <Text className="mt-1 text-xs text-hmuted">
            {first.farmerName}
            {first.farmerCity ? ` · ${first.farmerCity}` : ""}
          </Text>
          <Text className="mt-3 text-xs text-hmuted">
            {listings.length} parti mevcut — istediğin partilerden miktar seç, tek teklif gönder.
          </Text>
        </View>

        <RepresentativePhoto
          src={photoUrl}
          isRepresentative={isRepresentative}
          alt={formatCropIngredient(first.crop)}
          placeholderEmoji={cropEmoji(first.crop)}
          style={{ height: 176, marginTop: 16 }}
        />

        <View className="mt-4 gap-3 px-5">
          {listings.map((l, idx) => (
            <BatchRow
              key={l.id}
              listing={l}
              index={idx}
              qty={selected[l.id] ?? 0}
              belowMin={belowMinListingIds.has(l.id)}
              onQtyChange={(n) => setSelected((s) => ({ ...s, [l.id]: n }))}
            />
          ))}
        </View>

        <View className="mt-5 px-5">
          <Text className="mb-2 text-xs text-hmuted">Teslimat</Text>
          {DELIVERY_OPTIONS.map((d) => {
            const on = delivery === d.id;
            return (
              <Pressable
                key={d.id}
                onPress={() => setDelivery(d.id)}
                className="mb-2 flex-row items-center gap-3 rounded-xl border p-3"
                style={{
                  borderColor: on ? "#C8833B" : "rgba(255,255,255,0.15)",
                  backgroundColor: on ? "rgba(200,131,59,0.12)" : "rgba(255,255,255,0.03)",
                }}
              >
                <View
                  className="h-5 w-5 items-center justify-center rounded-full border-2"
                  style={{ borderColor: on ? "#C8833B" : "#9A9186" }}
                >
                  {on && <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#C8833B" }} />}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-hwhite">{d.label}</Text>
                  <Text className="text-xs text-hmuted">{d.desc}</Text>
                </View>
              </Pressable>
            );
          })}

          <Text className="mb-2 mt-3 text-xs text-hmuted">Teslim Tarihi</Text>
          <View className="flex-row flex-wrap gap-2">
            {DELIVERY_DATE_PRESETS.map((p) => {
              const on = deliveryDays === p.days;
              return (
                <Pressable
                  key={p.days}
                  onPress={() => setDeliveryDays(p.days)}
                  className="rounded-full border px-3 py-2"
                  style={{
                    borderColor: on ? "#C8833B" : "rgba(255,255,255,0.15)",
                    backgroundColor: on ? "rgba(200,131,59,0.12)" : "transparent",
                  }}
                >
                  <Text className="text-xs text-hwhite">{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mb-1 mt-4 text-xs text-hmuted">Not (opsiyonel)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Üreticiye iletmek istediğiniz mesaj..."
            placeholderTextColor="rgba(253,250,245,0.3)"
            className="min-h-[60px] rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-hwhite"
          />

          {submitError && <Text className="mt-3 text-xs text-hred">{submitError}</Text>}
        </View>
      </ScrollView>

      <View
        className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-dark px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-row items-center gap-4">
          <View className="flex-1">
            <Text className="text-xs text-hmuted">Toplam</Text>
            <Text className="font-mono text-lg" style={{ color: "#C8833B" }}>
              {formatTRY(totalPrice)}
              {items.length > 0 && (
                <Text className="text-xs text-hmuted">
                  {"  "}
                  {formatQuantity(totalQty, canonicalUnit)} {canonicalUnit} · {items.length} parti
                </Text>
              )}
            </Text>
          </View>
          <Pressable
            disabled={!canSubmit || createOffer.isPending}
            onPress={() => void submit()}
            className="items-center rounded-full px-6 py-3.5"
            style={{ backgroundColor: "#C8833B", opacity: !canSubmit || createOffer.isPending ? 0.4 : 1 }}
          >
            {createOffer.isPending ? (
              <ActivityIndicator color="#FDFAF5" />
            ) : (
              <Text className="text-sm font-medium text-hwhite">Teklif Gönder →</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BatchRow({
  listing,
  index,
  qty,
  belowMin,
  onQtyChange,
}: {
  listing: FarmerCropListing;
  index: number;
  qty: number;
  belowMin: boolean;
  onQtyChange: (n: number) => void;
}) {
  const { data: stock } = useListingStock(listing.id);
  const available = stock?.available ?? listing.quantity;
  const soldOut = available <= 0;
  const label = listing.batchName || `Parti #${index + 1}`;

  const clampAndSet = (raw: number) => {
    if (!Number.isFinite(raw) || raw < 0) raw = 0;
    if (raw > available) raw = available;
    onQtyChange(raw);
  };

  return (
    <View
      className="rounded-2xl border border-white/10 bg-white/5 p-4"
      style={{ opacity: soldOut ? 0.6 : 1 }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-medium text-hwhite">{label}</Text>
            {listing.quality && (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(200,131,59,0.2)" }}>
                <Text className="text-[10px]" style={{ color: "#C8833B" }}>
                  Kalite {listing.quality}
                </Text>
              </View>
            )}
          </View>
          <Text className="mt-1 text-xs text-hmuted">
            Mevcut {formatQuantity(available, listing.unit)} {listing.unit} ·{" "}
            <Text style={{ color: "#C8833B" }}>
              {formatTRY(listing.pricePerUnit)}/{listing.unit}
            </Text>
          </Text>
          <Text className="mt-0.5 text-[11px] text-hmuted">
            Min. sipariş {formatQuantity(listing.minOrder, listing.unit)} {listing.unit}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          value={qty ? String(qty) : ""}
          onChangeText={(t) => clampAndSet(Number(t.replace(",", ".")))}
          keyboardType="decimal-pad"
          editable={!soldOut}
          placeholder="0"
          placeholderTextColor="rgba(253,250,245,0.3)"
          className="w-24 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-hwhite"
        />
        <Text className="text-xs text-hmuted">{listing.unit}</Text>
        <View className="flex-1 items-end">
          {qty > 0 && <Text className="text-xs text-hwhite">{formatTRY(qty * listing.pricePerUnit)}</Text>}
        </View>
      </View>

      {belowMin && (
        <Text className="mt-1.5 text-[11px]" style={{ color: "#D4A843" }}>
          Bu partide minimum sipariş {formatQuantity(listing.minOrder, listing.unit)} {listing.unit} — girdiğiniz miktar bunun
          altında kaldığı sürece teklif gönderilemez.
        </Text>
      )}
    </View>
  );
}
