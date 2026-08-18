// F13-dar — tarifler ekranında süre/malzeme/diyet filtresi. Web'in
// tarifler.index.tsx filtre çubuğunun mobil karşılığı: aynı üç filtre, aynı
// eşikler (aktif süre = hazırlık+pişirme, `v_recipe_coverage.available_count
// >= 1`, `diet_tags`'te GERÇEKTEN kullanılan değerler) — migration yok,
// yalnızca var olan veriye UI. Proje genelinde bottom-sheet kütüphanesi yok;
// CropRequestSheet.tsx'teki Modal + slide-up desenini birebir izliyor.
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";

export type DurationBucket = "30" | "60" | null;

export interface RecipeFilters {
  duration: DurationBucket;
  diet: string | null;
  onlyAvailable: boolean;
}

export const EMPTY_RECIPE_FILTERS: RecipeFilters = {
  duration: null,
  diet: null,
  onlyAvailable: false,
};

export function activeFilterCount(f: RecipeFilters): number {
  return (f.duration ? 1 : 0) + (f.diet ? 1 : 0) + (f.onlyAvailable ? 1 : 0);
}

const DURATION_OPTIONS: { key: NonNullable<DurationBucket>; label: string }[] = [
  { key: "30", label: "30 dk'dan az" },
  { key: "60", label: "1 saate kadar" },
];

export function RecipeFilterSheet({
  visible,
  onClose,
  filters,
  onChange,
  dietTags,
  coverageAvailable,
}: {
  visible: boolean;
  onClose: () => void;
  filters: RecipeFilters;
  onChange: (f: RecipeFilters) => void;
  dietTags: string[];
  /** v_recipe_coverage yüklendi mi — offline'da false, checkbox devre dışı. */
  coverageAvailable: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingScreen style={{ justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <ScrollView
          className="max-h-[85%] rounded-t-2xl bg-dark"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 16 }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-medium text-hwhite">Filtrele</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text className="text-xl text-hwhite">✕</Text>
            </Pressable>
          </View>

          <Text className="mb-2 text-[11px] uppercase tracking-wider text-hmuted">Süre</Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            <FilterChip
              label="Hepsi"
              active={filters.duration === null}
              onPress={() => onChange({ ...filters, duration: null })}
            />
            {DURATION_OPTIONS.map((o) => (
              <FilterChip
                key={o.key}
                label={o.label}
                active={filters.duration === o.key}
                onPress={() => onChange({ ...filters, duration: o.key })}
              />
            ))}
          </View>

          {dietTags.length > 0 && (
            <>
              <Text className="mb-2 text-[11px] uppercase tracking-wider text-hmuted">Diyet etiketi</Text>
              <View className="mb-4 flex-row flex-wrap gap-2">
                <FilterChip
                  label="Hepsi"
                  active={filters.diet === null}
                  onPress={() => onChange({ ...filters, diet: null })}
                />
                {dietTags.map((d) => (
                  <FilterChip
                    key={d}
                    label={d}
                    active={filters.diet === d}
                    onPress={() => onChange({ ...filters, diet: d })}
                  />
                ))}
              </View>
            </>
          )}

          <Text className="mb-2 text-[11px] uppercase tracking-wider text-hmuted">Malzeme</Text>
          <Pressable
            disabled={!coverageAvailable}
            onPress={() => onChange({ ...filters, onlyAvailable: !filters.onlyAvailable })}
            className="mb-2 flex-row items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5"
            style={{ opacity: coverageAvailable ? 1 : 0.4 }}
          >
            <Text className="flex-1 text-sm text-hwhite">Malzemesi Hasat'ta olan tarifler</Text>
            <View
              className="h-5 w-9 rounded-full p-0.5"
              style={{ backgroundColor: filters.onlyAvailable ? "#C8833B" : "rgba(253,250,245,0.15)" }}
            >
              <View
                className="h-4 w-4 rounded-full bg-hwhite"
                style={{ marginLeft: filters.onlyAvailable ? 16 : 0 }}
              />
            </View>
          </Pressable>
          {!coverageAvailable && (
            <Text className="mb-2 text-[11px] text-hmuted">Bu filtre çevrimdışıyken kullanılamaz.</Text>
          )}

          <View className="mt-4 flex-row gap-2">
            <Pressable
              onPress={() => onChange(EMPTY_RECIPE_FILTERS)}
              className="flex-1 items-center rounded-xl border border-white/15 py-3"
            >
              <Text className="text-sm font-medium text-hwhite">Temizle</Text>
            </Pressable>
            <Pressable onPress={onClose} className="flex-1 items-center rounded-xl bg-saffron py-3">
              <Text className="text-sm font-medium text-hwhite">Uygula</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingScreen>
    </Modal>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border px-3 py-1.5"
      style={{
        borderColor: active ? "#C8833B" : "rgba(253,250,245,0.15)",
        backgroundColor: active ? "rgba(200,131,59,0.25)" : "transparent",
      }}
    >
      <Text className="text-xs" style={{ color: active ? "#C8833B" : "rgba(253,250,245,0.7)" }}>
        {label}
      </Text>
    </Pressable>
  );
}
