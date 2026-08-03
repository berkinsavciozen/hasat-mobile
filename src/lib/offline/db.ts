// expo-sqlite kurulumu — Apple 4.2'nin çekirdek testi burada karşılanıyor
// (bkz. hasat-vault/Build/P23-Mobile-Visual-Spec.md → "2. Offline Durumu"):
// uçak modunda uygulama açılmalı ve daha önce görülmüş tarifler görünmeli.
//
// Kasıtlı olarak yalnızca EDİTORYAL/DURAĞAN veri burada tutulur (tarif metni,
// adımlar, malzeme listesi). Fiyat/stok gibi CANLI veri (rpc_recipe_availability,
// rpc_recipe_shopping_list) hiçbir zaman bu veritabanına yazılmaz — bayat fiyat
// göstermek güven tezini çürütür (bkz. Build/P23-Mobile.md → "Fiyat kilidi").
// Çevrimdışıyken bu RPC'ler hiç çağrılmaz (bkz. recipes.ts), sonuç: gösterilecek
// bayat bir fiyat asla oluşmaz — "ne zaman bayatladığını göster" sorusuna
// gerek kalmaz çünkü fiyat offline'da baştan gösterilmez.
import * as SQLite from "expo-sqlite";

const DB_NAME = "hasat-recipe-cache.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS cached_recipes (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT,
          display_photo_url TEXT,
          is_representative_photo INTEGER NOT NULL DEFAULT 0,
          servings INTEGER,
          prep_minutes INTEGER,
          cook_minutes INTEGER,
          rest_minutes INTEGER,
          difficulty TEXT,
          cuisine TEXT,
          diet_tags TEXT NOT NULL DEFAULT '[]',
          cached_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cached_recipe_steps (
          recipe_id TEXT NOT NULL,
          step_no INTEGER NOT NULL,
          id TEXT NOT NULL,
          instruction TEXT NOT NULL,
          photo_url TEXT,
          timer_seconds INTEGER,
          PRIMARY KEY (recipe_id, step_no)
        );

        CREATE TABLE IF NOT EXISTS cached_recipe_ingredients (
          recipe_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL,
          id TEXT NOT NULL,
          crop TEXT,
          free_text_name TEXT,
          quantity REAL,
          unit TEXT,
          note TEXT,
          is_key_ingredient INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (recipe_id, sort_order)
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
