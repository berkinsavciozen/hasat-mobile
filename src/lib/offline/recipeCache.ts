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
  };
}

function fromRow(row: any): RecipeListItem {
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
    diet_tags: JSON.parse(row.diet_tags ?? "[]"),
    cover_photo_url: null,
  };
}

/** Ağdan başarıyla gelen tam tarif listesini önbelleğe yazar — tüm tablo
 * yeniden yazılır (18 satırlık küçük bir tablo için tek-seferlik silme +
 * ekleme, kısmi diff mantığı gerekmez). */
export async function cacheRecipeList(items: RecipeListItem[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM cached_recipes");
    for (const item of items) {
      const row = toRow(item);
      await db.runAsync(
        `INSERT INTO cached_recipes
          (id, slug, title, description, display_photo_url, is_representative_photo,
           servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ],
      );
    }
  });
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
): Promise<{ recipe: RecipeListItem; cachedAt: number } | null> {
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
         servings, prep_minutes, cook_minutes, rest_minutes, difficulty, cuisine, diet_tags, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         slug=excluded.slug, title=excluded.title, description=excluded.description,
         display_photo_url=excluded.display_photo_url,
         is_representative_photo=excluded.is_representative_photo,
         servings=excluded.servings, prep_minutes=excluded.prep_minutes,
         cook_minutes=excluded.cook_minutes, rest_minutes=excluded.rest_minutes,
         difficulty=excluded.difficulty, cuisine=excluded.cuisine,
         diet_tags=excluded.diet_tags, cached_at=excluded.cached_at`,
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
    })),
  };
}
