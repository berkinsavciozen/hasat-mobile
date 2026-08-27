import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { OfflineBanner } from "@/components/hasat/OfflineBanner";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import { PushPermissionCard } from "@/components/hasat/PushPermissionCard";
import { IntroTourModal } from "@/components/hasat/IntroTourModal";
import { hasSeenIntroTour, markIntroTourSeen } from "@/lib/hasat/introTour";
import {
  useRecipeList,
  useRecipeCoverage,
  totalRecipeMinutes,
  activeRecipeMinutes,
  formatTotalMinutes,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  type RecipeListItem,
} from "@/lib/hasat/recipes";
import {
  useMyRecipes,
  SOURCE_TYPE_LABELS,
  type MyRecipeItem,
} from "@/lib/hasat/myRecipes";
import {
  useFavoriteRecipes,
  useToggleRecipeSave,
  type FavoriteRecipeItem,
} from "@/lib/hasat/favorites";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/hasat/import";
import { getNotificationPermission } from "@/lib/native/notifications";
import {
  registerPushTokenIfPermitted,
  requestPushPermissionWithContext,
} from "@/lib/native/push";
import {
  RecipeFilterSheet,
  EMPTY_RECIPE_FILTERS,
  activeFilterCount,
  type RecipeFilters,
} from "@/components/hasat/RecipeFilterSheet";
import { useUnreadCount } from "@/lib/hasat/notifications";
import { AppIcon } from "@/components/hasat/AppIcon";

/**
 * P23-M5-b: tarif listesi, mobil v1'in huni girişi (bkz. Build/P23-Mobile.md
 * → "Stratejik çerçeve": "tarif → kayıt → talep → teklif → sipariş").
 *
 * P23-M6 eki: "Defterim" sekmesi (kullanıcının AI ile içe aktardığı kendi
 * tarifleri) + "Tarif Ekle" girişi + push izni bağlam kartı. Public korpus ile
 * kullanıcı defteri AYRI SEKMELER — hiçbir zaman aynı listede birleşmiyor
 * (Build/P23-Mobile.md → "Zorunlu tasarım kuralı": public korpus = Hasat'ın
 * editoryal içeriği, kullanıcı importları = kişisel defter).
 *
 * P23-M7-d: Çıkış ve Hesabımı Sil buradan (köşe metin linkleri) `/profile`'a
 * taşındı — ikisinin yan yana durması, çıkış çalışmadığında kullanıcının
 * yanlışlıkla hesap silmeye sürüklenmesi riski taşıyordu (bkz. TODO.md →
 * M7-d build log). Siparişlerim de aynı turda eklendi (`/orders`, salt
 * okunur). Tam 5 sekmelik alt navigasyon (Visual-Spec → "4. Alt Navigasyon")
 * hâlâ kurulmadı — o tasarım ayrı bir tab bar varsayıyor (M7-b/M8 kapsamı),
 * buradaki köşe linkleri onun yerine geçmiyor, geçici köprü.
 */
type Tab = "public" | "mine";

export default function RecipeListScreen() {
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const [tab, setTab] = useState<Tab>("public");
  const { data, isLoading, isError, refetch, isRefetching } = useRecipeList();
  const mine = useMyRecipes();
  // F5 — "Favorilerim", "Tariflerim"den (kendi importlarım) AYRI bir alt
  // sekme: ikisi hiçbir zaman aynı listede karışmıyor.
  const [mineSubTab, setMineSubTab] = useState<"own" | "favorites">("own");
  const favorites = useFavoriteRecipes();
  const [refreshing, setRefreshing] = useState(false);

  // ── F13-dar: süre/malzeme/diyet filtresi ──────────────────────────────────
  const coverage = useRecipeCoverage();
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_RECIPE_FILTERS);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [search, setSearch] = useState("");

  // ── F10-lite: bell ─────────────────────────────────────────────────────────
  const { data: unreadCount = 0 } = useUnreadCount();

  // ── Push izni: bağlam kartı ────────────────────────────────────────────────
  const [showPushCard, setShowPushCard] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // ── İlk-kullanım tanıtım turu ────────────────────────────────────────────
  // `/home`'un ilk mount'una bağlandı (yalnızca `onboarding.tsx`'in
  // `finish()`'ine değil): yeni kayıtları da, tur eklenmeden önce zaten
  // profili olan mevcut kullanıcıları da tek bir yerden kapsar. Bayrak
  // cihaz-genel (AsyncStorage) — `push.ts`'teki `LAST_TOKEN_KEY` deseniyle
  // aynı basit mekanizma (kural #106: yeni bir kalıcılık yolu icat etme).
  const [introVisible, setIntroVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await hasSeenIntroTour();
      if (!cancelled && !seen) setIntroVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getNotificationPermission();
      if (cancelled) return;
      if (state === "granted") {
        // İzin zaten var — token'ı sessizce tazele. Aynı cihazda ikinci bir
        // kullanıcı giriş yaptıysa devir tam burada gerçekleşiyor
        // (`rpc_register_device_token`, P23-M6).
        void registerPushTokenIfPermitted();
      } else if (state === "undetermined") {
        setShowPushCard(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const acceptPush = useCallback(async () => {
    setPushBusy(true);
    try {
      await requestPushPermissionWithContext();
    } finally {
      setPushBusy(false);
      setShowPushCard(false);
    }
  }, []);

  const items = data?.items ?? [];
  const showEmptyOfflineState = isOffline && !isLoading && items.length === 0;
  const myItems = mine.data ?? [];
  const favoriteItems = favorites.data ?? [];
  const savedRecipeIds = useMemo(
    () => new Set(favoriteItems.map((recipe) => recipe.id)),
    [favoriteItems],
  );

  const dietTags = Array.from(
    new Set(items.flatMap((r) => r.diet_tags)),
  ).sort();
  const filterCount = activeFilterCount(filters);
  const hasSearch = search.trim().length > 0;
  const hasActiveConstraints = hasSearch || filterCount > 0;
  const filteredItems = items.filter((r) => {
    const needle = search.trim().toLocaleLowerCase("tr-TR");
    if (
      needle &&
      ![r.title, r.cuisine, ...r.diet_tags]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("tr-TR").includes(needle))
    )
      return false;
    if (filters.diet && !r.diet_tags.includes(filters.diet)) return false;
    if (filters.duration) {
      const mins = activeRecipeMinutes(r);
      const max = filters.duration === "30" ? 30 : 60;
      const prevMax = filters.duration === "30" ? 0 : 30;
      if (!(mins > prevMax && mins <= max)) return false;
    }
    if (filters.onlyAvailable && !isOffline) {
      const available = coverage.data?.get(r.id)?.available_count ?? 0;
      if (available < 1) return false;
    }
    return true;
  });

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-2">
        <View className="flex-1">
          <Text className="font-serif text-2xl font-bold text-hwhite">
            Tarifler
          </Text>
          <Text className="text-xs text-hmuted">
            Mevsiminde, çiftçiden doğrudan malzemeyle pişirin.
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => router.push("/notifications")}
            className="h-12 w-12 items-center justify-center rounded-xl"
            accessibilityRole="button"
            accessibilityLabel={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ""}`}
          >
            <View>
              <AppIcon name="bell" />
              {unreadCount > 0 && (
                <View
                  className="absolute -right-1.5 -top-1.5 min-w-[14px] items-center rounded-full px-1"
                  style={{ backgroundColor: "#C8833B" }}
                >
                  <Text className="text-[9px] font-bold text-hwhite">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={() => router.push("/orders")}
            className="h-12 w-12 items-center justify-center rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Siparişler"
          >
            <AppIcon name="orders" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/profile")}
            className="h-12 w-12 items-center justify-center rounded-xl"
            accessibilityRole="button"
            accessibilityLabel="Profil"
          >
            <AppIcon name="profile" />
          </Pressable>
        </View>
      </View>

      <View className="mx-4 mb-3 flex-row rounded-xl border border-white/10 bg-white/5 p-1">
        <TabButton
          label="Hasat Tarifleri"
          active={tab === "public"}
          onPress={() => setTab("public")}
        />
        <TabButton
          label={`Defterim${myItems.length > 0 ? ` (${myItems.length})` : ""}`}
          active={tab === "mine"}
          onPress={() => setTab("mine")}
        />
      </View>

      {tab === "public" && (
        <View className="mx-4 mb-3 flex-row items-center gap-2">
          <View className="h-12 flex-1 flex-row items-center rounded-xl border border-white/15 bg-white/5 px-3">
            <AppIcon name="search" size={18} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tarif, mutfak veya etiket ara"
              placeholderTextColor="#8A9CA3"
              className="ml-2 flex-1 text-sm text-hwhite"
              accessibilityLabel="Tariflerde ara"
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={() => setFilterSheetOpen(true)}
            className="h-12 flex-row items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3"
            accessibilityRole="button"
            accessibilityLabel={`Filtreler${filterCount ? `, ${filterCount} etkin` : ""}`}
          >
            <AppIcon name="filter" size={18} />
            <Text className="text-xs text-hwhite">Filtrele</Text>
            {filterCount > 0 && (
              <View className="rounded-full bg-saffron px-1.5">
                <Text className="text-[10px] font-bold text-hwhite">
                  {filterCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      )}

      {isOffline && (tab === "mine" || items.length > 0) && <OfflineBanner />}

      {showPushCard && !isOffline && (
        <PushPermissionCard
          busy={pushBusy}
          onAccept={() => void acceptPush()}
          onDismiss={() => setShowPushCard(false)}
        />
      )}

      {tab === "mine" ? (
        <>
          <View className="mx-4 mb-3 flex-row rounded-xl border border-white/10 bg-white/5 p-1">
            <TabButton
              label={`Tariflerim${myItems.length > 0 ? ` (${myItems.length})` : ""}`}
              active={mineSubTab === "own"}
              onPress={() => setMineSubTab("own")}
            />
            <TabButton
              label={`Favorilerim${favoriteItems.length > 0 ? ` (${favoriteItems.length})` : ""}`}
              active={mineSubTab === "favorites"}
              onPress={() => setMineSubTab("favorites")}
            />
          </View>
          {mineSubTab === "own" ? (
            <MyRecipesTab
              isOffline={isOffline}
              isLoading={mine.isLoading}
              items={myItems}
              bottomInset={insets.bottom}
            />
          ) : (
            <FavoritesTab
              isOffline={isOffline}
              isLoading={favorites.isLoading}
              items={favoriteItems}
              bottomInset={insets.bottom}
            />
          )}
        </>
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F6E82" />
        </View>
      ) : showEmptyOfflineState ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ fontSize: 40 }}>📶✕</Text>
          <Text className="mt-4 text-center text-base font-medium text-hwhite">
            Bağlantı yok
          </Text>
          <Text className="mt-1 text-center text-sm text-hmuted">
            Tarifleri görmek için internete bağlanın.
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="mt-6 min-h-12 justify-center rounded-xl bg-primary px-6 py-3"
          >
            <Text className="font-medium text-hwhite">
              {isRefetching ? "Deneniyor…" : "Yeniden Dene"}
            </Text>
          </Pressable>
        </View>
      ) : isError && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-hmuted">
            Tarifler yüklenemedi.
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="mt-4 min-h-12 justify-center rounded-xl bg-primary px-6 py-3"
          >
            <Text className="font-medium text-hwhite">Yeniden Dene</Text>
          </Pressable>
        </View>
      ) : hasActiveConstraints && filteredItems.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-hmuted">
            {hasSearch && filterCount > 0
              ? "Arama ve filtrelerle eşleşen tarif yok."
              : hasSearch
                ? `“${search.trim()}” aramasıyla eşleşen tarif yok.`
                : "Bu filtrelerle eşleşen tarif yok."}
          </Text>
          <Pressable
            onPress={() => {
              setSearch("");
              setFilters(EMPTY_RECIPE_FILTERS);
            }}
            className="mt-4 min-h-12 justify-center rounded-xl bg-primary px-6 py-3"
            accessibilityRole="button"
            accessibilityLabel={
              hasSearch && filterCount > 0
                ? "Aramayı ve filtreleri temizle"
                : hasSearch
                  ? "Aramayı temizle"
                  : "Filtreleri temizle"
            }
          >
            <Text className="font-medium text-hwhite">
              {hasSearch && filterCount > 0
                ? "Aramayı ve Filtreleri Temizle"
                : hasSearch
                  ? "Aramayı Temizle"
                  : "Filtreleri Temizle"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 96,
          }}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refetch();
            setRefreshing(false);
          }}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              isSaved={savedRecipeIds.has(item.id)}
              favoriteStateLoading={favorites.isLoading}
              availableCount={
                coverage.data?.get(item.id)?.available_count ?? undefined
              }
            />
          )}
        />
      )}

      {/* AI import girişi — her iki sekmede de erişilebilir (kural #102: bir
          özelliğin var olması, kullanıcının ona ulaşabilmesiyle aynı şey
          değil). Çevrimdışıyken de basılabilir; import ekranı çevrimdışı
          durumu kendi içinde açıklıyor. */}
      <Pressable
        onPress={() => router.push("/import")}
        className="absolute right-5 min-h-12 justify-center rounded-xl bg-primary px-5 py-3.5"
        accessibilityRole="button"
        accessibilityLabel="Tarif ekle"
        style={{ bottom: insets.bottom + 20 }}
      >
        <Text className="font-medium text-hwhite">+ Tarif Ekle</Text>
      </Pressable>

      <RecipeFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        dietTags={dietTags}
        coverageAvailable={!isOffline}
      />

      <IntroTourModal
        visible={introVisible}
        onFinish={() => {
          setIntroVisible(false);
          void markIntroTourSeen();
        }}
      />
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-11 flex-1 items-center justify-center rounded-lg px-2 py-2 ${active ? "bg-primary" : ""}`}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text
        className={`text-xs font-medium ${active ? "text-hwhite" : "text-hmuted"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MyRecipesTab({
  isOffline,
  isLoading,
  items,
  bottomInset,
}: {
  isOffline: boolean;
  isLoading: boolean;
  items: MyRecipeItem[];
  bottomInset: number;
}) {
  if (isOffline) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-hmuted">
          Defterin çevrimdışı görüntülenemiyor — kendi tariflerin cihaz
          önbelleğinde tutulmuyor (önbellek yalnızca Hasat'ın herkese açık
          tariflerini tutar). Bağlanınca burada olacaklar.
        </Text>
      </View>
    );
  }
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#1F6E82" />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 36 }}>📓</Text>
        <Text className="mt-3 text-center text-base font-medium text-hwhite">
          Defterin boş
        </Text>
        <Text className="mt-1.5 text-center text-sm text-hmuted">
          Elindeki bir tarifin fotoğrafını çek ya da metnini yapıştır — buraya
          yalnızca sana görünen bir tarif olarak eklensin.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 96 }}
      renderItem={({ item }) => {
        const minutes =
          (item.prep_minutes ?? 0) +
          (item.cook_minutes ?? 0) +
          (item.rest_minutes ?? 0);
        const lowConfidence =
          item.extraction_confidence != null &&
          item.extraction_confidence < LOW_CONFIDENCE_THRESHOLD;
        return (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/recipe/[slug]",
                params: { slug: item.slug, own: "1" },
              })
            }
            className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3"
          >
            <Text className="text-base font-medium text-hwhite">
              {item.title}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
              <Text className="text-[11px] text-hmuted">
                🔒 yalnızca sana görünür ·{" "}
                {SOURCE_TYPE_LABELS[item.source_type] ?? item.source_type}
              </Text>
              {minutes > 0 && (
                <Text className="text-[11px] text-hmuted">
                  · 🕐 {formatTotalMinutes(minutes)}
                </Text>
              )}
            </View>
            {lowConfidence && (
              <Text className="mt-1.5 text-[11px] text-gold">
                ⚠️ Okurken emin olamadık — gözden geçirmek isteyebilirsin.
              </Text>
            )}
          </Pressable>
        );
      }}
    />
  );
}

/** F5 — favorilediğim Hasat tarifleri. `MyRecipesTab`'ın kardeşi ama ayrı bir
 * sorgu/liste: kendi importlarımla (Defterim → Tariflerim) hiçbir zaman
 * birleşmiyor. Buradan public tarif detayına gidiyor (`own` param'ı YOK —
 * bunlar Hasat'ın herkese açık tarifleri, kullanıcının kendi taslağı değil). */
function FavoritesTab({
  isOffline,
  isLoading,
  items,
  bottomInset,
}: {
  isOffline: boolean;
  isLoading: boolean;
  items: FavoriteRecipeItem[];
  bottomInset: number;
}) {
  if (isOffline) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-hmuted">
          Favorilerin çevrimdışı görüntülenemiyor. Bağlanınca burada olacaklar.
        </Text>
      </View>
    );
  }
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#1F6E82" />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 36 }}>🤍</Text>
        <Text className="mt-3 text-center text-base font-medium text-hwhite">
          Henüz favorin yok
        </Text>
        <Text className="mt-1.5 text-center text-sm text-hmuted">
          Hasat Tarifleri'nde beğendiğin bir tarifin kalp ikonuna dokun, buraya
          eklensin.
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(r) => r.id}
      contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 96 }}
      renderItem={({ item }) => {
        const minutes =
          (item.prep_minutes ?? 0) +
          (item.cook_minutes ?? 0) +
          (item.rest_minutes ?? 0);
        return (
          <Pressable
            onPress={() => router.push(`/recipe/${item.slug}`)}
            className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3"
          >
            <Text className="text-base font-medium text-hwhite">
              {item.title}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
              {item.difficulty && (
                <Text className="text-[11px] text-hmuted">
                  {DIFFICULTY_LABELS[item.difficulty] ?? item.difficulty}
                </Text>
              )}
              {item.cuisine && (
                <Text className="text-[11px] text-hmuted">
                  · {item.cuisine}
                </Text>
              )}
              {minutes > 0 && (
                <Text className="text-[11px] text-hmuted">
                  · 🕐 {formatTotalMinutes(minutes)}
                </Text>
              )}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

function RecipeCard({
  recipe,
  isSaved,
  favoriteStateLoading,
  availableCount,
}: {
  recipe: RecipeListItem;
  isSaved: boolean;
  favoriteStateLoading: boolean;
  availableCount?: number;
}) {
  const minutes = totalRecipeMinutes(recipe);
  const [optimisticSaved, setOptimisticSaved] = useState(isSaved);
  const toggle = useToggleRecipeSave(recipe.id);

  useEffect(() => {
    setOptimisticSaved(isSaved);
  }, [isSaved]);

  const favoriteBusy = favoriteStateLoading || toggle.isPending;

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.slug}`)}
      className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
      accessibilityRole="button"
      accessibilityLabel={`${recipe.title}, ${formatTotalMinutes(minutes)}`}
    >
      <RepresentativePhoto
        src={recipe.displayPhotoUrl}
        isRepresentative={recipe.isRepresentativePhoto}
        alt={recipe.title}
        style={{ width: "100%", aspectRatio: 4 / 3 }}
      />
      <Pressable
        disabled={favoriteBusy}
        onPress={(event) => {
          event.stopPropagation();
          const previousSaved = optimisticSaved;
          const nextSaved = !previousSaved;
          setOptimisticSaved(nextSaved);
          toggle.mutate(nextSaved, {
            onError: () => setOptimisticSaved(previousSaved),
          });
        }}
        className="absolute right-3 top-3 h-12 w-12 items-center justify-center rounded-xl bg-dark/80"
        accessibilityRole="button"
        accessibilityLabel={
          optimisticSaved ? "Favorilerden çıkar" : "Favorilere ekle"
        }
        accessibilityState={{
          selected: optimisticSaved,
          busy: favoriteBusy,
          disabled: favoriteBusy,
        }}
      >
        <AppIcon
          name={optimisticSaved ? "favoriteSelected" : "favorite"}
          color={optimisticSaved ? "#C0392B" : "#FDFAF5"}
        />
      </Pressable>
      <View className="px-4 py-3">
        <Text className="text-base font-medium text-hwhite" numberOfLines={2}>
          {recipe.title}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
          {minutes > 0 && (
            <Text className="text-[11px] text-hmuted">
              🕐 {formatTotalMinutes(minutes)}
            </Text>
          )}
          {recipe.difficulty && (
            <Text className="text-[11px] text-hmuted">
              · {DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}
            </Text>
          )}
          {recipe.cuisine && (
            <Text className="text-[11px] text-hmuted">· {recipe.cuisine}</Text>
          )}
        </View>
        {needsAdvanceStart(recipe) && (
          <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-gold/25 px-2 py-0.5">
            <Text className="text-[10px] font-medium text-dark">
              ⏰ Önceden başlamak gerekir
            </Text>
          </View>
        )}
        {availableCount != null && (
          <Text className="mt-2 text-[11px] text-teal">
            {availableCount > 0
              ? `${availableCount} malzeme için üretici seçeneği var`
              : "Malzeme seçenekleri henüz eşleşmedi"}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
