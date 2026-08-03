import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import { OfflineBanner } from "@/components/hasat/OfflineBanner";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { formatIngredientName, formatTRY } from "@/lib/hasat/format";
import { cropEmoji } from "@/lib/hasat/crop-emoji";
import {
  useRecipeDetail,
  useRecipeAvailability,
  useRecipeShoppingList,
  useLogRecipeView,
  useIngredientMaps,
  formatTimeBreakdown,
  formatTimer,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  type RecipeIngredientRow,
} from "@/lib/hasat/recipes";

/**
 * P23-M5-b tarif detayı — Build/P23-Mobile-Visual-Spec.md'nin kapsam dışı
 * bıraktığı bir ekran (web'deki desenin doğrudan portu, bkz. "Kapsam dışı
 * bırakılanlar" tablosu). "Talep Et" bu turda YOK (görev tanımı madde 3) —
 * eşleşmeyen malzeme kartı yalnızca nötr "Hasat'ta henüz yok" rozeti
 * gösteriyor, aksiyon butonu yok. Eşleşen malzemede de "Ürüne Git" web'de
 * `/buyer/discover`'a gidiyor; mobilde o ekran M7'ye kadar yok, bu yüzden
 * kartta yalnızca fiyat/stok bilgisi salt-okunur gösteriliyor, kırık bir
 * bağlantı YOK.
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

  // Kendi taslağında ölçümleme/eşleştirme yok: `recipe_views` public korpusun
  // hunisini ölçüyor (v_kpi_recipe_funnel), kişisel defter o huniye girmiyor;
  // malzemelerin `crop`'u da bu akışta daima NULL (editoryal eşleştirme).
  useLogRecipeView(isOwn ? undefined : recipe?.id);
  const { data: availability = [] } = useRecipeAvailability(isOwn ? undefined : recipe?.id);
  const { data: shoppingList = [] } = useRecipeShoppingList(
    isOwn ? undefined : recipe?.id,
    effectiveServings,
  );
  const { availByIngredient, shopByIngredient } = useIngredientMaps(availability, shoppingList);

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

      <View className="px-5 py-4">
        <Pressable onPress={() => router.back()}>
          <Text className="text-xs text-hmuted">← Tüm tarifler</Text>
        </Pressable>
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
            />
          ))}
        </View>
      </View>

      <View className="mt-6 px-5">
        <Text className="text-xs font-medium uppercase tracking-wider text-hmuted">Hazırlanışı</Text>

        {/* P23-M6 — Pişirme moduna giriş. Şartname (Visual-Spec → "1. Pişirme
            Modu" → "Adım listesi (giriş noktası)"): adımların özeti burada,
            en altta değil en üstte bir CTA — kullanıcı adımları okumadan da
            başlayabilmeli. Adım yoksa buton hiç render edilmiyor. */}
        {steps.length > 0 && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/cook/[slug]",
                params: isOwn ? { slug: r.slug, own: "1" } : { slug: r.slug },
              })
            }
            className="mt-3 items-center rounded-2xl bg-saffron py-4"
          >
            <Text className="text-base font-medium text-hwhite">👨‍🍳 Pişirmeye Başla</Text>
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

function IngredientCard({
  ingredient,
  isOffline,
  avail,
  shop,
}: {
  ingredient: RecipeIngredientRow;
  isOffline: boolean;
  avail?: import("@/lib/hasat/recipes").AvailabilityRow;
  shop?: import("@/lib/hasat/recipes").ShoppingListRow;
}) {
  const name = formatIngredientName(ingredient.crop, avail?.crop_display_name, ingredient.free_text_name);
  const qtyLine = shop
    ? `${shop.scaled_quantity ?? shop.recipe_quantity ?? ""} ${shop.recipe_unit ?? ""}`.trim()
    : `${ingredient.quantity ?? ""} ${ingredient.unit ?? ""}`.trim();
  const isPlatformCrop = shop?.is_platform_crop ?? !!ingredient.crop;
  const isMatched = shop?.is_matched ?? false;

  return (
    <View className="mb-2 flex-row items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-cream">
        {avail?.crop_photo_url ? (
          <Image source={{ uri: avail.crop_photo_url }} className="h-11 w-11" resizeMode="cover" />
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
        ) : !isPlatformCrop ? null : isMatched ? (
          <View className="mt-1">
            <Text className="text-[11px] text-hmuted">
              {shop?.best_price_per_canonical != null && shop?.canonical_unit && (
                <>
                  {formatTRY(shop.best_price_per_canonical)}/{shop.canonical_unit}
                </>
              )}
              {shop?.min_order_canonical != null && shop?.canonical_unit && (
                <> · Min. sipariş {shop.min_order_canonical} {shop.canonical_unit}</>
              )}
              {avail && avail.active_listing_count > 0 && <> · {avail.active_listing_count} aktif ilan</>}
            </Text>
            {shop?.rounded_up_to_min_order && shop.canonical_unit && (
              <Text className="text-[11px] text-hmuted">
                Bu tarif için {shop.needed_canonical} {shop.canonical_unit} yeterli, ama minimum
                sipariş {shop.purchase_canonical} {shop.canonical_unit}
                {shop.recipes_covered != null && ` — bu miktar ~${Math.round(shop.recipes_covered)} tarif yapar.`}
              </Text>
            )}
            {shop?.estimated_cost != null && (
              <Text className="text-[11px] text-hmuted">Tahmini maliyet: {formatTRY(shop.estimated_cost)}</Text>
            )}
          </View>
        ) : (
          // Baskın durum (68 malzemenin 54'ü) — nötr rozet, aksiyon YOK
          // ("Talep Et" bu turda kapsam dışı, görev tanımı madde 3).
          <View className="mt-1.5 self-start rounded-full bg-hmuted/20 px-2 py-0.5">
            <Text className="text-[10px] font-medium text-hmuted">Hasat'ta henüz yok</Text>
          </View>
        )}
      </View>
    </View>
  );
}
