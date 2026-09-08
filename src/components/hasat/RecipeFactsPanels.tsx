import { Text, View } from "react-native";

import {
  formatNutritionNumber,
  scaleNutrition,
  type AllergenPresentation,
  type NutritionPresentation,
  type NutritionValues,
} from "@/lib/hasat/recipeDetailPresentation";

const NUTRIENTS: Array<{
  key: keyof NutritionValues;
  label: string;
  unit: "kcal" | "g";
}> = [
  { key: "caloriesKcal", label: "Kalori", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Karbonhidrat", unit: "g" },
  { key: "fatG", label: "Yağ", unit: "g" },
  { key: "fiberG", label: "Lif", unit: "g" },
];

function NutritionMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: "kcal" | "g";
}) {
  const shown = value === null ? "Bilgi yok" : `${formatNutritionNumber(value)} ${unit}`;
  return (
    <View
      className="rounded-xl bg-white/5 p-3"
      style={{ flexBasis: "47%", flexGrow: 1, minWidth: 120 }}
      accessible
      accessibilityLabel={`${label}: ${shown}`}
    >
      <Text className="text-xs text-hmuted">{label}</Text>
      <Text className="mt-1 text-base font-semibold text-hwhite">{shown}</Text>
    </View>
  );
}

function NutritionGrid({
  values,
  label,
}: {
  values: NutritionValues;
  label: string;
}) {
  return (
    <View accessibilityLabel={label}>
      <Text className="mb-2 text-sm font-semibold text-hwhite">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {NUTRIENTS.map((nutrient) => (
          <NutritionMetric
            key={nutrient.key}
            label={nutrient.label}
            value={values[nutrient.key]}
            unit={nutrient.unit}
          />
        ))}
      </View>
    </View>
  );
}

export function RecipeNutritionPanel({
  model,
  servings,
}: {
  model: NutritionPresentation;
  servings: number;
}) {
  return (
    <View className="mt-6" accessibilityRole="summary">
      <Text
        accessibilityRole="header"
        className="text-xs font-medium uppercase tracking-wider text-hmuted"
      >
        Besin değerleri
      </Text>
      <View className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        {model.state === "unavailable" ? (
          <Text className="text-sm text-hmuted">{model.message}</Text>
        ) : (
          <>
            <NutritionGrid values={model.perServing} label="1 porsiyon için" />
            {servings !== 1 && (
              <View className="mt-4 border-t border-white/10 pt-4">
                <NutritionGrid
                  values={scaleNutrition(model.perServing, servings)}
                  label={`${servings} porsiyon toplamı`}
                />
              </View>
            )}
            <Text
              className={`mt-4 text-xs leading-5 ${
                model.state === "computed" ? "text-hmuted" : "text-saffron"
              }`}
            >
              {model.explanation}
            </Text>
            <Text className="mt-2 text-[11px] leading-4 text-hmuted">
              Tahmini besin değerleridir; tıbbi veya diyetetik tavsiye değildir.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

export function RecipeAllergenPanel({
  model,
}: {
  model: AllergenPresentation;
}) {
  const unreviewed = model.state === "unreviewed";
  return (
    <View className="mt-6" accessibilityRole="summary">
      <Text
        accessibilityRole="header"
        className="text-xs font-medium uppercase tracking-wider text-hmuted"
      >
        Alerjen ve hassasiyet bilgisi
      </Text>
      <View
        className={`mt-3 rounded-2xl border p-4 ${
          unreviewed
            ? "border-saffron/40 bg-saffron/10"
            : "border-white/10 bg-white/5"
        }`}
      >
        <Text className={unreviewed ? "text-sm text-saffron" : "text-sm text-hwhite"}>
          {model.message}
        </Text>
        {model.state === "reviewed_with_labels" && (
          <View
            className="mt-3 flex-row flex-wrap gap-2"
            accessibilityLabel="İşaretlenen alerjen ve hassasiyetler"
          >
            {model.labels.map((label) => (
              <View
                key={label}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5"
              >
                <Text className="text-xs font-medium text-hwhite">{label}</Text>
              </View>
            ))}
          </View>
        )}
        <Text className="mt-3 text-[11px] leading-4 text-hmuted">
          Bu bilgi tıbbi tavsiye değildir. Ürün etiketlerini ve mutfaktaki çapraz
          bulaşma riskini ayrıca kontrol edin.
        </Text>
      </View>
    </View>
  );
}
