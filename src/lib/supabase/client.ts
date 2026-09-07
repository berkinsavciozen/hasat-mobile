import { createHasatSupabaseClient } from "@/lib/core";
import { LargeSecureStore } from "./large-secure-store";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — check .env.",
  );
}

const authStorage = new LargeSecureStore();

// Supabase default storage key; keep the existing key so installed sessions migrate unchanged.
const authStorageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

export async function removeLocalAuthStorage(): Promise<void> {
  await authStorage.removeItem(authStorageKey);
  await authStorage.removeItem(`${authStorageKey}-user`);
  await authStorage.removeItem(`${authStorageKey}-code-verifier`);
}

export const supabase = createHasatSupabaseClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  storage: authStorage,
});
