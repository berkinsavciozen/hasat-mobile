import { useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { OfflineBanner } from "@/components/hasat/OfflineBanner";
import { RepresentativePhoto } from "@/components/hasat/RepresentativePhoto";
import {
  useRecipeList,
  totalRecipeMinutes,
  formatTotalMinutes,
  needsAdvanceStart,
  DIFFICULTY_LABELS,
  type RecipeListItem,
} from "@/lib/hasat/recipes";

/**
 * P23-M5-b: tarif listesi, mobil v1'in huni girişi (bkz. Build/P23-Mobile.md
 * → "Stratejik çerçeve": "tarif → kayıt → talep → teklif → sipariş"). M5-a'nın
 * geçici "Giriş yapıldı ✓" yer tutucusunun yerini alıyor — Çıkış butonu aynı
 * satırda küçük bir ikon olarak korunuyor (M5-a'nın oturum-kalıcılığı QA'sı
 * hâlâ bu ekrandan test edilebilsin diye). Tam 5 sekmelik alt navigasyon
 * (Build/P23-Mobile-Visual-Spec.md → "4. Alt Navigasyon") bilinçli olarak
 * BURADA kurulmadı: o tasarım Keşfet/Siparişlerim/Hesabım ekranlarını
 * varsayıyor, onlar M7 kapsamı — bu turun kapsamı yalnızca tarif listesi +
 * detayı (görev tanımı, madde 3).
 */
export default function RecipeListScreen() {
  const insets = useSafeAreaInsets();
  const clear = useHasatMobileSession((s) => s.clear);
  const isOffline = useIsOffline();
  const { data, isLoading, isError, refetch, isRefetching } = useRecipeList();
  const [refreshing, setRefreshing] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    clear();
  };

  const items = data?.items ?? [];
  const showEmptyOfflineState = isOffline && !isLoading && items.length === 0;

  return (
    <View className="flex-1 bg-dark" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-6 pb-3 pt-2">
        <View>
          <Text className="font-serif text-2xl font-bold text-hwhite">Tarifler</Text>
          <Text className="text-xs text-hmuted">Mevsiminde, çiftçiden doğrudan malzemeyle pişirin.</Text>
        </View>
        {/* Metin/emoji glifleri — proje hiçbir yerde ikon kütüphanesi
            kullanmıyor (login.tsx/index.tsx aynı desen); `lucide-react-native`
            eklemek `react-native-svg` native bağımlılığı getirir, EAS build
            kotası kısıtlıyken (bkz. M5-a-ek-2) gereksiz bir risk. */}
        <Pressable onPress={signOut} hitSlop={12} className="p-2">
          <Text className="text-xs text-hmuted">Çıkış ✕</Text>
        </Pressable>
      </View>

      {isOffline && items.length > 0 && <OfflineBanner />}

      {isLoading ? (
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
          <Pressable
            onPress={() => refetch()}
            className="mt-6 rounded-xl bg-saffron px-6 py-3"
          >
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
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refetch();
            setRefreshing(false);
          }}
          renderItem={({ item }) => <RecipeCard recipe={item} />}
        />
      )}
    </View>
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
