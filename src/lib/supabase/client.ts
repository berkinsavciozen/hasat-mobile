import { createHasatSupabaseClient } from "@/lib/core";
import { LargeSecureStore } from "./large-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — check .env.",
  );
}

export const supabase = createHasatSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  storage: new LargeSecureStore(),
});
