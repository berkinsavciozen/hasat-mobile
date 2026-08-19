import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Image, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { RepresentativePhoto, RepresentativeBadge } from "@/components/hasat/RepresentativePhoto";
import { OfflineBanner } from "@/components/hasat/OfflineBanner";
import { CropRequestSheet } from "@/components/hasat/CropRequestSheet";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { formatIngredientName, formatQuantity, formatTRY } from "@/lib/hasat/format";
import { cropEmoji } from "@/lib/hasat/crop-emoji";
import { getCookSession, type CookSession } from "@/lib/native/cookSession";
import { WEB_APP_URL } from "@/lib/hasat/webLinks";
import { useIsRecipeSaved, useToggleRecipeSave } from "@/lib/hasat/favorites";
import {
  useRecipeDetail,
  useRecipeAvailability,
  useRecipeShoppingList,
  useLogRecipeView,
  useIngredientMaps,
  useMatchedListingIds,
  formatTimeBreakdown,
  formatTimer,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  type RecipeIngredientRow,
  type MatchedListing,
} from "@/lib/hasat/recipes";

/**
 * P23-M5-b tarif detayı, P23-M6-ek'te dört-durumlu malzeme kartı aksiyonlarıyla
 * genişletildi, P23-M7-a'da 1. durum native'e taşındı (Build/P23-Mobile.md →
 * "Stratejik karar 2026-08-04" — mobil marketplace app'i, teklif oluşturma
 * web'e devredilmiyor):
 *   1. eşleşti + aktif ilan var → "Sipariş Ver" (native `/product/[farmerId]/[crop]`
 *      ekranı — P23-M6-ek'te web'e dışarı link veriyordu, artık native;
 *      mobilde hâlâ checkout YOK, teklif oluşturma ödeme değil)
 *   2. eşleşti + aktif ilan yok → "Talep Et" (ürün adı kilitli = ing.crop)
 *   3. tarımsal ama eşleşmedi → "Talep Et" (free_text_name, sınıf=tarımsal)
 *   4. platform-dışı → "Talep Et" de var (Berkin kararı — sinyal `ingredient_class`
 *      ile korunuyor, admin ısı haritası ayrı gösterir)
 */
export default function RecipeDetailScreen() {
  const insets = useSafeAreaInsets();
  const { slug, own } = useLocalSearchParams<{ slug: string; own?: string }>();
  const isOwn = own === "1";
  const isOffline = useIsOffline();
  const { data, isLoading, isError } = useRecipeDetail(slug, { own: isOwn });

  const recipe = data?.recipe;
  const [servings, setServings] = useState<number | null>(null);
  const effectiveServings = servings ?? recipe?.servings ?? 4;

  // Kendi taslağında ölçümleme yok: `recipe_views` public korpusun hunisini
  // ölçüyor (v_kpi_recipe_funnel), kişisel defter o huniye girmiyor. Malzeme
  // `crop`'u P23-M6-ek'ten beri kendi taslağında da NULL olmayabilir —
  // deterministik trigger import anında bağlıyor, kullanıcı önizlemede
  // düzeltebiliyor (bkz. app/import.tsx).
  useLogRecipeView(isOwn ? undefined : recipe?.id);
  const { data: availability = [] } = useRecipeAvailability(isOwn ? undefined : recipe?.id);
  const { data: shoppingList = [] } = useRecipeShoppingList(
    isOwn ? undefined : recipe?.id,
    effectiveServings,
  );
  const { availByIngredient, shopByIngredient } = useIngredientMaps(availability, shoppingList);
  const matchedCrops = (data?.ingredients ?? []).filter((i) => i.crop).map((i) => i.crop as string);
  const { data: matchedListingIds } = useMatchedListingIds(matchedCrops);

  // P23-M8-d (T4) — bulgu S33 adım 18: aktif bir pişirme oturumu varken bu
  // tarife geri dönüldüğünde kaldığı adımı gösterip doğrudan oraya
  // atlatıyoruz (banner aşağıda) — ekran her odaklandığında (cook mode'dan
  // "← Tüm tarifler"/geri ile dönüş dahil) tazeleniyor, `useFocusEffect`
  // sadece Query değil AsyncStorage bir kaynak okuduğu için TanStack Query
  // yerine burada elle kullanıldı.
  const [cookSession, setCookSession] = useState<CookSession | null>(null);
  useFocusEffect(
    useCallback(() => {
      const recipeId = recipe?.id;
      if (!recipeId) {
        setCookSession(null);
        return;
      }
      let cancelled = false;
      void getCookSession(recipeId).then((s) => {
        if (!cancelled) setCookSession(s);
      });
      return () => {
        cancelled = true;
      };
    }, [recipe?.id]),
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-sm text-hmuted">
          {isOffline
            ? isOwn
              ? "Kendi tariflerin çevrimdışı görüntülenemiyor — bağlanınca burada olacak."
              : "Bu tarif önbellekte yok — internete bağlanıp bir kez açtıktan sonra çevrimdışı da görünür."
            : "Tarif bulunamadı."}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-xs text-saffron underline">← Tariflere dön</Text>
        </Pressable>
      </View>
    );
  }

  const { recipe: r, steps, ingredients, source } = data;
  const timeBreakdown = formatTimeBreakdown(r.prep_minutes, r.cook_minutes, r.rest_minutes);

  // Yalnızca public (Hasat) tarifler paylaşılabilir — Defterim'deki kişisel
  // taslaklar (own=1) henüz paylaşılabilir değil (share_token modeli v1.1,
  // Launch-Scope-Plan.md → F8). Yanlışlıkla private bir link paylaşılmasın.
  const shareUrl = `${WEB_APP_URL}/tarifler/${r.slug}`;
  const handleShare = () => {
    void Share.share({
      message: `${r.title} — Hasat'ta bu tarife göz at: ${shareUrl}`,
      url: shareUrl,
      title: r.title,
    });
  };

  // Adım listesi değişmiş olabilir (kullanıcı düzenledi) — kayıtlı adım
  // artık aralık dışındaysa son adıma kilitleniyor, çökme yerine.
  const resumeStepIndex =
    cookSession && steps.length > 0
      ? Math.min(Math.max(cookSession.stepIndex, 0), steps.length - 1)
      : null;

  const cookModeParams = (targetStep: number | null) => ({
    slug: r.slug,
    ...(isOwn ? { own: "1" } : {}),
    ...(targetStep != null ? { step: String(targetStep) } : {}),
  });

  return (
    <ScrollView className="flex-1 bg-dark" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
      {isOffline && source === "cache" && <OfflineBanner />}

      <View style={{ paddingTop: insets.top }}>
        <RepresentativePhoto
          src={r.displayPhotoUrl}
          isRepresentative={r.isRepresentativePhoto}
          alt={r.title}
          style={{ width: "100%", height: 220 }}
        />
      </View>

      {/* P23-M8-d (T4) — bulgu S33 adım 18, Berkin'in önerisi (a): aktif
          pişirme adımına giden vurgulu bir alan, ekranın en üstünde. */}
      {resumeStepIndex != null && (
        <Pressable
          onPress={() =>
            router.push({ pathname: "/cook/[slug]", params: cookModeParams(resumeStepIndex) })
          }
          className="mx-5 mt-4 flex-row items-center justify-between rounded-2xl border border-saffron bg-saffron/15 px-4 py-3"
        >
          <View className="flex-1 pr-2">
            <Text className="text-sm font-medium text-hwhite">👨‍🍳 Pişirmeye devam ediyorsun</Text>
            <Text className="mt-0.5 text-xs text-hmuted">
              Adım {resumeStepIndex + 1}/{steps.length}
            </Text>
          </View>
          <Text className="text-sm font-medium text-saffron">Devam Et →</Text>
        </Pressable>
      )}

      <View className="px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()}>
            <Text className="text-xs text-hmuted">← Tüm tarifler</Text>
          </Pressable>
          {isOwn ? (
            // F7 — Defterim'deki kendi tarifimi düzenleme girişi. Aynı ekranı
            // (app/import.tsx'in "review" aşaması) düzenleme modunda açıyor —
            // `recipeId` route param'ı ile (kural #106: yeni ekran yok).
            <Pressable
              onPress={() => router.push({ pathname: "/import", params: { recipeId: r.id } })}
              hitSlop={8}
              className="rounded-full border border-white/15 px-3 py-1"
            >
              <Text className="text-xs text-hmuted">✏️ Düzenle</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2">
              {/* F5 — yalnızca kişisel yer imi, herkese açık sayaç yok. */}
              <FavoriteButton recipeId={r.id} />
              <Pressable
                onPress={handleShare}
                hitSlop={8}
                className="rounded-full border border-white/15 px-3 py-1"
              >
                <Text className="text-xs text-hmuted">🔗 Paylaş</Text>
              </Pressable>
            </View>
          )}
        </View>
        <Text className="mt-2 font-serif text-2xl font-bold text-hwhite">{r.title}</Text>
        {r.description && <Text className="mt-2 text-sm text-hmuted">{r.description}</Text>}

        <View className="mt-3 flex-row flex-wrap items-center gap-x-2 gap-y-1">
          {timeBreakdown ? (
            <Text className="text-xs text-hmuted">🕐 {timeBreakdown}</Text>
          ) : null}
          {r.difficulty && (
            <Text className="text-xs text-hmuted">
              {DIFFICULTY_LABELS[r.difficulty] ?? r.difficulty}
            </Text>
          )}
          {r.cuisine && <Text className="text-xs text-hmuted">{r.cuisine}</Text>}
        </View>

        {needsAdvanceStart(r) && (
          <View className="mt-2 flex-row items-center self-start rounded-full bg-gold/25 px-2.5 py-1">
            <Text className="text-xs font-medium text-dark">⏰ Önceden başlamak gerekir</Text>
          </View>
        )}

        {r.diet_tags.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-1">
            {r.diet_tags.map((d) => (
              <View key={d} className="rounded-full bg-sage/25 px-2 py-0.5">
                <Text className="text-[10px] font-medium text-hwhite">{d}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="px-5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-medium uppercase tracking-wider text-hmuted">Malzemeler</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setServings((s) => Math.max(1, (s ?? r.servings ?? 4) - 1))}
              className="h-7 w-7 items-center justify-center rounded-full border border-white/15"
            >
              <Text className="text-hwhite">−</Text>
            </Pressable>
            <Text className="min-w-[70px] text-center text-sm font-medium text-hwhite">
              {effectiveServings} porsiyon
            </Text>
            <Pressable
              onPress={() => setServings((s) => (s ?? r.servings ?? 4) + 1)}
              className="h-7 w-7 items-center justify-center rounded-full border border-white/15"
            >
              <Text className="text-hwhite">+</Text>
            </Pressable>
          </View>
        </View>

        <View className="mt-3">
          {ingredients.map((ing) => (
            <IngredientCard
              key={ing.id}
              ingredient={ing}
              isOffline={isOffline}
              avail={availByIngredient.get(ing.id)}
              shop={shopByIngredient.get(ing.id)}
              matchedListing={ing.crop ? matchedListingIds?.get(ing.crop) : undefined}
              recipeId={isOwn ? undefined : recipe?.id}
            />
          ))}
        </View>
      </View>

      <View className="mt-6 px-5">
        <Text className="text-xs font-medium uppercase tracking-wider text-hmuted">Hazırlanışı</Text>

        {/* P23-M6 — Pişirme moduna giriş. Şartname (Visual-Spec → "1. Pişirme
            Modu" → "Adım listesi (giriş noktası)"): adımların özeti burada,
            en altta değil en üstte bir CTA — kullanıcı adımları okumadan da
            başlayabilmeli. Adım yoksa buton hiç render edilmiyor.
            P23-M8-d (T4), Berkin'in önerisi (b): aktif pişirme oturumu varsa
            buton metni "Pişirmeye Başla" yerine "Devam Et" olsun ve kaldığı
            adıma götürsün — banner'la aynı hedef, iki ayrı giriş noktası. */}
        {steps.length > 0 && (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/cook/[slug]", params: cookModeParams(resumeStepIndex) })
            }
            className="mt-3 items-center rounded-2xl bg-saffron py-4"
          >
            <Text className="text-base font-medium text-hwhite">
              {resumeStepIndex != null ? "▶ Devam Et" : "👨‍🍳 Pişirmeye Başla"}
            </Text>
          </Pressable>
        )}
        {steps.some((s) => s.timer_seconds != null) && (
          <Text className="mt-2 text-center text-[11px] text-hmuted">
            Süreli adımlarda zamanlayıcı çalışır, ekran kararmaz.
          </Text>
        )}

        <View className="mt-3">
          {steps.map((s) => (
            <View key={s.id} className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <View className="flex-row items-start gap-2">
                <Text className="pt-0.5 font-mono text-xs text-hmuted">{s.step_no}.</Text>
                <View className="flex-1">
                  <Text className="text-sm text-hwhite">{s.instruction}</Text>
                  {s.photo_url && (
                    <Image
                      source={{ uri: s.photo_url }}
                      className="mt-2 h-32 w-full rounded-lg"
                      resizeMode="cover"
                    />
                  )}
                  {s.timer_seconds != null && (
                    <Text className="mt-1 text-[11px] text-hmuted">⏱ {formatTimer(s.timer_seconds)}</Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View className="mx-5 mt-4 rounded-xl border border-dashed border-white/15 p-3">
        <Text className="text-[11px] text-hmuted">
          Hasat hızlı teslimat uygulaması değildir: teslim süresi ve minimum sipariş miktarı
          çiftçiden doğrudan, mevsiminde ve güvenilir tedarik içindir — anında değil.
        </Text>
      </View>
    </ScrollView>
  );
}

/** F5 — optimistic UI: dokununca kalp hemen dolar/boşalır, `recipe_saves`
 * isteği arkada gider; başarısız olursa `useToggleRecipeSave`'in
 * `onError`'ı önceki duruma geri alır (bkz. lib/hasat/favorites.ts). */
function FavoriteButton({ recipeId }: { recipeId: string }) {
  const { data: isSaved = false } = useIsRecipeSaved(recipeId);
  const toggle = useToggleRecipeSave(recipeId);
  return (
    <Pressable
      onPress={() => toggle.mutate(!isSaved)}
      hitSlop={8}
      accessibilityLabel={isSaved ? "Favorilerden çıkar" : "Favorilere ekle"}
      className="h-7 w-7 items-center justify-center rounded-full border border-white/15"
    >
      <Text style={{ fontSize: 13 }}>{isSaved ? "❤️" : "🤍"}</Text>
    </Pressable>
  );
}

function IngredientCard({
  ingredient,
  isOffline,
  avail,
  shop,
  matchedListing,
  recipeId,
}: {
  ingredient: RecipeIngredientRow;
  isOffline: boolean;
  avail?: import("@/lib/hasat/recipes").AvailabilityRow;
  shop?: import("@/lib/hasat/recipes").ShoppingListRow;
  matchedListing?: MatchedListing;
  recipeId?: string;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const name = formatIngredientName(ingredient.crop, avail?.crop_display_name, ingredient.free_text_name);
  const qtyLine = shop
    ? `${formatQuantity(shop.scaled_quantity ?? shop.recipe_quantity, shop.recipe_unit)} ${shop.recipe_unit ?? ""}`.trim()
    : `${formatQuantity(ingredient.quantity, ingredient.unit)} ${ingredient.unit ?? ""}`.trim();
  const isMatched = !!ingredient.crop && (shop?.is_matched ?? false);

  // P23-M6-ek — dört durum:
  //   1. eşleşti + aktif ilan var  -> "Sipariş Ver" (dış link)
  //   2. eşleşti + aktif ilan yok  -> "Talep Et" (ürün adı kilitli = crop)
  //   3. tarımsal ama eşleşmedi    -> "Talep Et" (serbest metin, sınıf tarımsal)
  //   4. platform-dışı             -> "Talep Et" de var (Berkin kararı, sinyal korunuyor)
  const requestClass = ingredient.crop ? "tarimsal" : (ingredient.ingredient_class ?? "platform_disi");
  const requestName = ingredient.crop ?? ingredient.free_text_name ?? "";

  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <View className="h-11 w-11 items-center justify-center rounded-lg bg-cream">
        {avail?.crop_photo_url ? (
          <>
            {/* rounded-lg burada, üstteki View'da değil — sarmalayıcının
                overflow-hidden'ı ⓘ tooltip'ini kırpardı (P23-M7-g). */}
            <Image
              source={{ uri: avail.crop_photo_url }}
              className="h-11 w-11 rounded-lg"
              resizeMode="cover"
              accessibilityLabel={`${name} (temsili görsel)`}
            />
            {/* crop_photo_url her zaman crop_config'in stok fotoğrafı — malzeme
                belirli bir ilana değil crop'a bağlı, her göründüğünde temsili
                (P23-M7-g). */}
            <RepresentativeBadge className="bottom-0 right-0" />
          </>
        ) : (
          <Text style={{ fontSize: 20 }}>{cropEmoji(ingredient.crop)}</Text>
        )}
      </View>
      <View className="flex-1">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-sm font-medium text-hwhite" numberOfLines={1}>
            {name}
          </Text>
          {ingredient.is_key_ingredient && (
            <Text className="text-[9px] uppercase tracking-wide text-hmuted">ana malzeme</Text>
          )}
        </View>
        <Text className="text-xs text-hmuted">
          {qtyLine}
          {ingredient.note ? ` · ${ingredient.note}` : ""}
        </Text>

        {isOffline ? (
          <Text className="mt-1 text-[11px] text-hmuted">
            Çevrimdışı — fiyat ve stok bilgisi gösterilmiyor.
          </Text>
        ) : isMatched ? (
          <View className="mt-1">
            <Text className="text-[11px] text-hmuted">
              {shop?.best_price_per_canonical != null && shop?.canonical_unit && (
                <>
                  {formatTRY(shop.best_price_per_canonical)}/{shop.canonical_unit}
                </>
              )}
              {shop?.min_order_canonical != null && shop?.canonical_unit && (
                <> · Min. sipariş {formatQuantity(shop.min_order_canonical, shop.canonical_unit)} {shop.canonical_unit}</>
              )}
              {avail && avail.active_listing_count > 0 && <> · {avail.active_listing_count} aktif ilan</>}
            </Text>
            {shop?.rounded_up_to_min_order && shop.canonical_unit && (
              <Text className="text-[11px] text-hmuted">
                Bu tarif için {formatQuantity(shop.needed_canonical, shop.canonical_unit)} {shop.canonical_unit} yeterli, ama minimum
                sipariş {formatQuantity(shop.purchase_canonical, shop.canonical_unit)} {shop.canonical_unit}
                {shop.recipes_covered != null && ` — bu miktar ~${Math.round(shop.recipes_covered)} tarif yapar.`}
              </Text>
            )}
            {shop?.estimated_cost != null && (
              <Text className="text-[11px] text-hmuted">Tahmini maliyet: {formatTRY(shop.estimated_cost)}</Text>
            )}
            {matchedListing && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/product/[farmerId]/[crop]",
                    params: recipeId
                      ? { farmerId: matchedListing.farmerId, crop: ingredient.crop!, recipeId }
                      : { farmerId: matchedListing.farmerId, crop: ingredient.crop! },
                  })
                }
                hitSlop={8}
                className="mt-1.5 self-start rounded-full px-3 py-1.5"
                style={{ backgroundColor: "#C8833B" }}
              >
                <Text className="text-xs font-semibold text-hwhite">Sipariş Ver →</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <View className="self-start rounded-full bg-hmuted/20 px-2 py-0.5">
              <Text className="text-[10px] font-medium text-hmuted">Hasat'ta henüz yok</Text>
            </View>
            {requestName && (
              <Pressable
                onPress={() => setRequestOpen(true)}
                hitSlop={8}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: "#C8833B" }}
              >
                <Text className="text-xs font-semibold text-hwhite">Talep Et →</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {requestName && (
        <CropRequestSheet
          visible={requestOpen}
          onClose={() => setRequestOpen(false)}
          lockCropName={!!ingredient.crop}
          initialCropName={requestName}
          initialQuantity={shop?.purchase_canonical ?? ingredient.quantity ?? null}
          initialUnit={shop?.canonical_unit ?? ingredient.unit ?? null}
          ingredientClass={requestClass}
          recipeId={recipeId}
        />
      )}
    </View>
  );
}
