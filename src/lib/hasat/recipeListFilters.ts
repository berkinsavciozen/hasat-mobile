import {
  matchesAllergenExclusion,
  type AllergenSlug,
} from "./recipeFacts";
import type { RecipeListItem } from "./types";

export const EQUIPMENT_OPTIONS = [
  { slug: "firin", label: "Fırın" },
  { slug: "ocak", label: "Ocak/Tencere" },
  { slug: "mikrodalga", label: "Mikrodalga" },
  { slug: "airfryer", label: "Air Fryer" },
  { slug: "blender", label: "Blender" },
  { slug: "mutfak-robotu", label: "Mutfak Robotu" },
  { slug: "duduklu-tencere", label: "Düdüklü Tencere" },
  { slug: "izgara", label: "Izgara/Barbekü" },
  { slug: "ozel-ekipman-gerekmiyor", label: "Özel Ekipman Gerekmiyor" },
] as const;

export type EquipmentSlug = (typeof EQUIPMENT_OPTIONS)[number]["slug"];
export type DurationBucket = "30" | "60" | null;

export interface RecipeFilters {
  duration: DurationBucket;
  diet: string | null;
  onlyAvailable: boolean;
  excludedAllergens: AllergenSlug[];
  equipment: EquipmentSlug[];
}

export const EMPTY_RECIPE_FILTERS: RecipeFilters = {
  duration: null,
  diet: null,
  onlyAvailable: false,
  excludedAllergens: [],
  equipment: [],
};

export function activeFilterCount(filters: RecipeFilters): number {
  return (
    (filters.duration ? 1 : 0) +
    (filters.diet ? 1 : 0) +
    (filters.onlyAvailable ? 1 : 0) +
    filters.excludedAllergens.length +
    filters.equipment.length
  );
}

// DQ-2 — vegan ⊂ vejetaryen: vegan etiketli tarif "vejetaryen" filtresinden
// geçer. Ters yön geçmez; diğer etiketler birebir eşleşir.
const DIET_IMPLIED_BY: Record<string, string[]> = {
  vejetaryen: ["vegan"],
};

export function matchesDiet(dietTags: string[], diet: string): boolean {
  if (dietTags.includes(diet)) return true;
  return (DIET_IMPLIED_BY[diet] ?? []).some((tag) => dietTags.includes(tag));
}

export function matchesRecipeFilters(
  recipe: RecipeListItem,
  filters: RecipeFilters,
  availability: { coverageAvailable: boolean; availableCount?: number },
): boolean {
  if (filters.diet && !matchesDiet(recipe.diet_tags, filters.diet)) return false;
  if (filters.duration) {
    const minutes = (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0);
    const max = filters.duration === "30" ? 30 : 60;
    const previousMax = filters.duration === "30" ? 0 : 30;
    if (!(minutes > previousMax && minutes <= max)) return false;
  }
  if (
    filters.equipment.length > 0 &&
    !filters.equipment.every((slug) => recipe.required_equipment.includes(slug))
  )
    return false;
  if (!matchesAllergenExclusion(recipe, filters.excludedAllergens)) return false;
  if (
    filters.onlyAvailable &&
    availability.coverageAvailable &&
    (availability.availableCount ?? 0) < 1
  )
    return false;
  return true;
}
