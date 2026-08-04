// Web'in `src/lib/hasat/recipes.ts`'teki tip tanımlarıyla birebir aynı satır
// kümesi (mobil offline cache'in de aynı şekle ihtiyacı olduğu için ayrı bir
// dosyaya çıkarıldı — `recipes.ts` ve `offline/recipeCache.ts` ikisi de
// buradan alır, döngüsel import olmaz).
export interface RecipeListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_photo_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  rest_minutes: number | null;
  difficulty: string | null;
  cuisine: string | null;
  diet_tags: string[];
  displayPhotoUrl: string | null;
  isRepresentativePhoto: boolean;
}

export type RecipeDetail = RecipeListItem;

export interface RecipeStepRow {
  id: string;
  step_no: number;
  instruction: string;
  photo_url: string | null;
  timer_seconds: number | null;
}

export interface RecipeIngredientRow {
  id: string;
  sort_order: number;
  crop: string | null;
  free_text_name: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  is_key_ingredient: boolean;
  /** P23-M6-ek: extract-recipe'in olgusal sınıflandırması ("tarımsal" ürün mü
   * yoksa market malzemesi mi), kullanıcı önizlemede düzeltebilir. Malzeme
   * kartının dört-durum aksiyonlarını (Sipariş Ver / Talep Et) sürer. */
  ingredient_class: "tarimsal" | "platform_disi" | null;
}

export interface AvailabilityRow {
  ingredient_id: string;
  sort_order: number;
  crop: string | null;
  crop_display_name: string | null;
  crop_photo_url: string | null;
  free_text_name: string | null;
  quantity: number | null;
  unit: string | null;
  is_key_ingredient: boolean;
  is_platform_crop: boolean;
  is_matched: boolean;
  active_listing_count: number;
  canonical_unit: string | null;
  best_price_per_canonical: number | null;
}

export interface ShoppingListRow {
  ingredient_id: string;
  sort_order: number;
  crop: string | null;
  crop_display_name: string | null;
  free_text_name: string | null;
  is_platform_crop: boolean;
  is_matched: boolean;
  recipe_servings: number;
  requested_servings: number;
  scale_factor: number;
  recipe_quantity: number | null;
  recipe_unit: string | null;
  scaled_quantity: number | null;
  canonical_unit: string | null;
  needed_canonical: number | null;
  conversion_available: boolean;
  min_order_canonical: number | null;
  purchase_canonical: number | null;
  rounded_up_to_min_order: boolean | null;
  recipes_covered: number | null;
  best_price_per_canonical: number | null;
  estimated_cost: number | null;
}

export const DIFFICULTY_LABELS: Record<string, string> = {
  kolay: "Kolay",
  orta: "Orta",
  zor: "Zor",
};
