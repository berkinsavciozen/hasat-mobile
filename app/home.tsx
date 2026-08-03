import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { OfflineBanner } from "@/components/hasat/OfflineBanner";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import { PushPermissionCard } from "@/components/hasat/PushPermissionCard";
import {
  useRecipeList,
  totalRecipeMinutes,
  formatTotalMinutes,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  type RecipeListItem,
} from "@/lib/hasat/recipes";
import { useMyRecipes, SOURCE_TYPE_LABELS, type MyRecipeItem } from "@/lib/hasat/myRecipes";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/hasat/import";
import { getNotificationPermission } from "@/lib/native/notifications";
import {
  registerPushTokenIfPermitted,
  requestPushPermissionWithContext,
  unregisterPushTokenOnSignOut,
} from "@/lib/native/push";

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
 * Tam 5 sekmelik alt navigasyon (Visual-Spec → "4. Alt Navigasyon") hâlâ
 * kurulmadı: o tasarım Keşfet/Siparişlerim/Hesabım ekranlarını varsayıyor,
 * onlar M7 kapsamı. Buradaki iki sekme onun yerine geçmiyor, tarif katmanının
 * kendi içindeki ayrım.
 */
type Tab = "public" | "mine";

export default function RecipeListScreen() {
  const insets = useSafeAreaInsets();
  const clear = useHasatMobileSession((s) => s.clear);
  const isOffline = useIsOffline();
  const [tab, setTab] = useState<Tab>("public");
  const { data, isLoading, isError, refetch, isRefetching } = useRecipeList();
  const mine = useMyRecipes();
  const [refreshing, setRefreshing] = useState(false);

  // ── Push izni: bağlam kartı ────────────────────────────────────────────────
  const [showPushCard, setShowPushCard] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

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

  const signOut = async () => {
    await unregisterPushTokenOnSignOut();
    await supabase.auth.signOut();
    clear();
  };

  const items = data?.items ?? [];
  const showEmptyOfflineState = isOffline && !isLoading && items.length === 0;
  const myItems = mine.data ?? [];

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-2">
        <View className="flex-1">
          <Text className="font-serif text-2xl font-bold text-hwhite">Tarifler</Text>
          <Text className="text-xs text-hmuted">
            Mevsiminde, çiftçiden doğrudan malzemeyle pişirin.
          </Text>
        </View>
        {/* Metin/emoji glifleri — proje hiçbir yerde ikon kütüphanesi
            kullanmıyor (login.tsx/index.tsx aynı desen); `lucide-react-native`
            eklemek `react-native-svg` native bağımlılığı getirir, EAS build
            kotası kısıtlıyken (bkz. M5-a-ek-2) gereksiz bir risk. */}
        <Pressable onPress={signOut} hitSlop={12} className="p-2">
          <Text className="text-xs text-hmuted">Çıkış ✕</Text>
        </Pressable>
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

      {isOffline && (tab === "mine" || items.length > 0) && <OfflineBanner />}

      {showPushCard && !isOffline && (
        <PushPermissionCard
          busy={pushBusy}
          onAccept={() => void acceptPush()}
          onDismiss={() => setShowPushCard(false)}
        />
      )}

      {tab === "mine" ? (
        <MyRecipesTab
          isOffline={isOffline}
          isLoading={mine.isLoading}
          items={myItems}
          bottomInset={insets.bottom}
        />
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C8833B" />
        </View>
      ) : showEmptyOfflineState ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text style={{ fontSize: 40 }}>📶✕</Text>
          <Text className="mt-4 text-center text-base font-medium text-hwhite">Bağlantı yok</Text>
          <Text className="mt-1 text-center text-sm text-hmuted">
            Tarifleri görmek için internete bağlanın.
          </Text>
          <Pressable onPress={() => refetch()} className="mt-6 rounded-xl bg-saffron px-6 py-3">
            <Text className="font-medium text-hwhite">
              {isRefetching ? "Deneniyor…" : "Yeniden Dene"}
            </Text>
          </Pressable>
        </View>
      ) : isError && items.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-hmuted">Tarifler yüklenemedi.</Text>
          <Pressable onPress={() => refetch()} className="mt-4 rounded-xl bg-saffron px-6 py-3">
            <Text className="font-medium text-hwhite">Yeniden Dene</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refetch();
            setRefreshing(false);
          }}
          renderItem={({ item }) => <RecipeCard recipe={item} />}
        />
      )}

      {/* AI import girişi — her iki sekmede de erişilebilir (kural #102: bir
          özelliğin var olması, kullanıcının ona ulaşabilmesiyle aynı şey
          değil). Çevrimdışıyken de basılabilir; import ekranı çevrimdışı
          durumu kendi içinde açıklıyor. */}
      <Pressable
        onPress={() => router.push("/import")}
        className="absolute right-5 rounded-full bg-saffron px-5 py-3.5"
        style={{ bottom: insets.bottom + 20 }}
      >
        <Text className="font-medium text-hwhite">+ Tarif Ekle</Text>
      </Pressable>
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
      className={`flex-1 items-center rounded-lg py-2 ${active ? "bg-saffron" : ""}`}
    >
      <Text className={`text-xs font-medium ${active ? "text-hwhite" : "text-hmuted"}`}>
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
          Defterin çevrimdışı görüntülenemiyor — kendi tariflerin cihaz önbelleğinde
          tutulmuyor (önbellek yalnızca Hasat'ın herkese açık tariflerini tutar).
          Bağlanınca burada olacaklar.
        </Text>
      </View>
    );
  }
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#C8833B" />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text style={{ fontSize: 36 }}>📓</Text>
        <Text className="mt-3 text-center text-base font-medium text-hwhite">Defterin boş</Text>
        <Text className="mt-1.5 text-center text-sm text-hmuted">
          Elindeki bir tarifin fotoğrafını çek ya da metnini yapıştır — buraya yalnızca
          sana görünen bir tarif olarak eklensin.
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
          (item.prep_minutes ?? 0) + (item.cook_minutes ?? 0) + (item.rest_minutes ?? 0);
        const lowConfidence =
          item.extraction_confidence != null &&
          item.extraction_confidence < LOW_CONFIDENCE_THRESHOLD;
        return (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/recipe/[slug]", params: { slug: item.slug, own: "1" } })
            }
            className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3"
          >
            <Text className="text-base font-medium text-hwhite">{item.title}</Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
              <Text className="text-[11px] text-hmuted">
                🔒 yalnızca sana görünür ·{" "}
                {SOURCE_TYPE_LABELS[item.source_type] ?? item.source_type}
              </Text>
              {minutes > 0 && (
                <Text className="text-[11px] text-hmuted">· 🕐 {formatTotalMinutes(minutes)}</Text>
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

function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  const minutes = totalRecipeMinutes(recipe);
  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.slug}`)}
      className="mb-3 flex-row overflow-hidden rounded-2xl border border-white/10 bg-white/5"
    >
      <RepresentativePhoto
        src={recipe.displayPhotoUrl}
        isRepresentative={recipe.isRepresentativePhoto}
        alt={recipe.title}
        style={{ width: 96, height: 96 }}
      />
      <View className="flex-1 justify-center px-3 py-2">
        <Text className="text-base font-medium text-hwhite" numberOfLines={2}>
          {recipe.title}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-x-2">
          {minutes > 0 && (
            <Text className="text-[11px] text-hmuted">🕐 {formatTotalMinutes(minutes)}</Text>
          )}
          {recipe.difficulty && (
            <Text className="text-[11px] text-hmuted">
              · {DIFFICULTY_LABELS[recipe.difficulty] ?? recipe.difficulty}
            </Text>
          )}
          {recipe.cuisine && <Text className="text-[11px] text-hmuted">· {recipe.cuisine}</Text>}
        </View>
        {needsAdvanceStart(recipe) && (
          <View className="mt-1.5 flex-row items-center gap-1 self-start rounded-full bg-gold/25 px-2 py-0.5">
            <Text className="text-[10px] font-medium text-dark">⏰ Önceden başlamak gerekir</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
