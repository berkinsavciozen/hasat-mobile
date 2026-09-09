import { mapRecipeFacts } from "../hasat/recipeFacts";
import { deserializeRecipeFacts, serializeRecipeFacts } from "./recipeFactsCache";
import { getDb } from "./db";
import type { RecipeListItem, RecipeDetail, RecipeStepRow, RecipeIngredientRow } from "@/lib/hasat/types";

function toRow(r: RecipeListItem) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    display_photo_url: r.displayPhotoUrl,
    is_representative_photo: r.isRepresentativePhoto ? 1 : 0,
    servings: r.servings,
    prep_minutes: r.prep_minutes,
    cook_minutes: r.cook_minutes,
    rest_minutes: r.rest_minutes,
    difficulty: r.difficulty,
    cuisine: r.cuisine,
    diet_tags: JSON.stringify(r.diet_tags ?? []),
    required_equipment: JSON.stringify(r.required_equipment ?? []),
  };
}

function parseStringArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function fromRow(row: any): RecipeDetail {
  const facts = deserializeRecipeFacts(row.recipe_facts);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    displayPhotoUrl: row.display_photo_url,
    isRepresentativePhoto: !!row.is_representative_photo,
    servings: row.servings,
    prep_minutes: row.prep_minutes,
    cook_minutes: row.cook_minutes,
    rest_minutes: row.rest_minutes,
    difficulty: row.difficulty,
    cuisine: row.cuisine,
    diet_tags: parseStringArray(row.diet_tags),
    required_equipment: parseStringArray(row.required_equipment),
    cover_photo_url: null,
    ...facts,
  };
}

/** Ağdan başarıyla gelen tam tarif listesini önbelleğe yazar — tüm tablo
 * yeniden yazılır (18 satırlık küçük bir tablo için tek-seferlik silme +
 * ekleme, kısmi diff mantığı gerekmez). */
export async function cacheRecipeList(items: RecipeListItem[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    // List queries do not contain detail facts. Preserve them across list refreshes.
    const previous = await db.getAllAsync<{ id: string; recipe_facts: string | null }>(
      "SELECT id, recipe_facts FROM cached_recipes",
    );
    const factsById = new Map(previous.map((row) => [row.id, row.recipe_facts]));
    await db.runAsync("DELETE FROM cached_recipes");
    for (const item of items) {
      const row = toRow(item);
      const previousFacts = deserializeRecipeFacts(factsById.get(item.id));
      const listFacts = serializeRecipeFacts(
        mapRecipeFacts({
          ...previousFacts,
          allergen_labels: item.allergen_labels,
          allergens_reviewed: item.allergens_reviewed,
          allergens_reviewed_at: item.allergens_reviewed_at,
        }),
      );
      await db.runAsync(
        `INSERT INTO cached_recipes
          (id, slug, title, description, display_photo_url, is_representative_photo,
           servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags,
           cached_at, recipe_facts, required_equipment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.slug,
          row.title,
          row.description,
          row.display_photo_url,
          row.is_representative_photo,
          row.servings,
          row.prep_minutes,
          row.cook_minutes,
          row.rest_minutes,
          row.difficulty,
          row.cuisine,
          row.diet_tags,
          now,
          listFacts,
          row.required_equipment,
        ],
      );
    }
    // Listeden düşen tariflerin (silindi/gizlendi) yetim adım+malzeme
    // satırlarını temizle — cached_recipes yeniden yazıldı ama steps/ingredients
    // tabloları recipe_id bazlı, yukarıdaki DELETE onları etkilemiyordu.
    await db.runAsync(
      "DELETE FROM cached_recipe_steps WHERE recipe_id NOT IN (SELECT id FROM cached_recipes)",
    );
    await db.runAsync(
      "DELETE FROM cached_recipe_ingredients WHERE recipe_id NOT IN (SELECT id FROM cached_recipes)",
    );
    await db.runAsync(
      "DELETE FROM cached_recipe_detail_meta WHERE recipe_id NOT IN (SELECT id FROM cached_recipes)",
    );
  });
}

export interface DetailCacheStats {
  /** Adım+malzemesi önbellekte olan tarif sayısı. */
  count: number;
  /** Bu detayların en eskisinin önbelleklenme anı (epoch ms). */
  oldestCachedAt: number | null;
}

/** P23-M6 — bulk detay prefetch'inin gereksiz tekrarını önlemek için
 * (`useRecipeList` `staleTime` 60 sn; her refetch'te 18 tarifin detayını
 * yeniden indirmek boşuna trafik). Çağıran taraf: önbellekteki detay sayısı
 * liste sayısına eşitse VE en eski detay 24 saatten yeniyse prefetch atlanır. */
export async function getDetailCacheStats(): Promise<DetailCacheStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number; oldest: number | null }>(
    `SELECT COUNT(*) AS n, MIN(m.cached_at) AS oldest
       FROM cached_recipe_detail_meta m
       JOIN cached_recipes r ON r.id = m.recipe_id`,
  );
  return { count: row?.n ?? 0, oldestCachedAt: row?.oldest ?? null };
}

export async function getCachedRecipeList(): Promise<{
  items: RecipeListItem[];
  cachedAt: number | null;
}> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>("SELECT * FROM cached_recipes ORDER BY title ASC");
  if (rows.length === 0) return { items: [], cachedAt: null };
  const cachedAt = Math.min(...rows.map((r) => r.cached_at));
  return { items: rows.map(fromRow), cachedAt };
}

export async function getCachedRecipeBySlug(
  slug: string,
): Promise<{ recipe: RecipeDetail; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>("SELECT * FROM cached_recipes WHERE slug = ?", [slug]);
  if (!row) return null;
  return { recipe: fromRow(row), cachedAt: row.cached_at };
}

/** Bir tarifin adım + malzeme listesini önbelleğe yazar (detay ekranı ilk
 * açıldığında / ağdan tazelendiğinde çağrılır). */
export async function cacheRecipeDetail(
  recipe: RecipeDetail,
  steps: RecipeStepRow[],
  ingredients: RecipeIngredientRow[],
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  const row = toRow(recipe);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cached_recipes
        (id, slug, title, description, display_photo_url, is_representative_photo,
         servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags,
         cached_at, recipe_facts, required_equipment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug=excluded.slug, title=excluded.title, description=excluded.description,
         display_photo_url=excluded.display_photo_url,
         is_representative_photo=excluded.is_representative_photo,
         servings=excluded.servings, prep_minutes=excluded.prep_minutes,
         cook_minutes=excluded.cook_minutes, rest_minutes=excluded.rest_minutes,
         difficulty=excluded.difficulty, cuisine=excluded.cuisine,
         diet_tags=excluded.diet_tags, cached_at=excluded.cached_at,
         recipe_facts=excluded.recipe_facts,
         required_equipment=excluded.required_equipment`,
      [
        row.id,
        row.slug,
        row.title,
        row.description,
        row.display_photo_url,
        row.is_representative_photo,
        row.servings,
        row.prep_minutes,
        row.cook_minutes,
        row.rest_minutes,
        row.difficulty,
        row.cuisine,
        row.diet_tags,
        now,
        serializeRecipeFacts(mapRecipeFacts(recipe)),
        row.required_equipment,
      ],
    );
    await db.runAsync("DELETE FROM cached_recipe_steps WHERE recipe_id = ?", [recipe.id]);
    for (const s of steps) {
      await db.runAsync(
        `INSERT INTO cached_recipe_steps (recipe_id, step_no, id, instruction, photo_url, timer_seconds)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [recipe.id, s.step_no, s.id, s.instruction, s.photo_url, s.timer_seconds],
      );
    }
    await db.runAsync("DELETE FROM cached_recipe_ingredients WHERE recipe_id = ?", [recipe.id]);
    for (const i of ingredients) {
      await db.runAsync(
        `INSERT INTO cached_recipe_ingredients
          (recipe_id, sort_order, id, crop, free_text_name, quantity, unit, note, is_key_ingredient)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          recipe.id,
          i.sort_order,
          i.id,
          i.crop,
          i.free_text_name,
          i.quantity,
          i.unit,
          i.note,
          i.is_key_ingredient ? 1 : 0,
        ],
      );
    }
    await db.runAsync(
      `INSERT INTO cached_recipe_detail_meta (recipe_id, cached_at) VALUES (?, ?)
       ON CONFLICT(recipe_id) DO UPDATE SET cached_at = excluded.cached_at`,
      [recipe.id, now],
    );
  });
}

export async function getCachedRecipeDetail(slug: string): Promise<{
  recipe: RecipeDetail;
  steps: RecipeStepRow[];
  ingredients: RecipeIngredientRow[];
  cachedAt: number;
} | null> {
  const found = await getCachedRecipeBySlug(slug);
  if (!found) return null;
  const db = await getDb();
  const stepRows = await db.getAllAsync<any>(
    "SELECT * FROM cached_recipe_steps WHERE recipe_id = ? ORDER BY step_no ASC",
    [found.recipe.id],
  );
  const ingredientRows = await db.getAllAsync<any>(
    "SELECT * FROM cached_recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC",
    [found.recipe.id],
  );
  return {
    recipe: found.recipe,
    cachedAt: found.cachedAt,
    steps: stepRows.map((r) => ({
      id: r.id,
      step_no: r.step_no,
      instruction: r.instruction,
      photo_url: r.photo_url,
      timer_seconds: r.timer_seconds,
    })),
    ingredients: ingredientRows.map((r) => ({
      id: r.id,
      sort_order: r.sort_order,
      crop: r.crop,
      free_text_name: r.free_text_name,
      quantity: r.quantity,
      unit: r.unit,
      note: r.note,
      is_key_ingredient: !!r.is_key_ingredient,
      // Önbellek yalnızca public/editoryal korpus içindir (kullanıcı importu
      // hiç yazılmaz — bkz. dosya başlığı) ve editoryal satırlarda
      // `ingredient_class` daima NULL (yalnızca AI import sınıflandırıyor).
      ingredient_class: null,
    })),
  };
}
