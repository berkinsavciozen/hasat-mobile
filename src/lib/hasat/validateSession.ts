import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { inspectProfileSession } from "./profileSession";
import { invalidateProfileSession } from "./sessionGuard";

/** Always read the server profile; never authorize from persisted role alone. */
export async function validateSession(offline = false) {
  // Do not let late Zustand hydration resurrect the previous user after cleanup.
  if (!useHasatMobileSession.persist.hasHydrated()) {
    await useHasatMobileSession.persist.rehydrate();
  }
  useHasatMobileSession.getState().clearRoleResolution();
  if (offline) return { status: "unavailable" } as const;
  let inspectedUserId: string | null = null;
  const result = await inspectProfileSession({
    getSession: async () => {
      const { data, error } = await supabase.auth.getSession();
      inspectedUserId = data.session?.user.id ?? null;
      return { userId: inspectedUserId, error };
    },
    getProfile: async (id) => supabase.from("profiles")
      .select("id, role, deleted_at, name, city, phone, premium")
      .eq("id", id).maybeSingle(),
  });
  if (result.status !== "unavailable") {
    const { data, error } = await supabase.auth.getSession();
    if ((data.session?.user.id ?? null) !== inspectedUserId ||
        (error && result.status !== "invalid")) return { status: "unavailable" } as const;
  }
  if (result.status === "invalid") await invalidateProfileSession();
  if (result.status === "guest") useHasatMobileSession.getState().clear();
  if (result.status === "active") {
    const { profile } = result;
    // The identity recheck above prevents late results restoring a signed-out user.
    useHasatMobileSession.getState().setRole(profile.role === "buyer" ? "buyer" : "farmer", profile.id);
    useHasatMobileSession.getState().updateUser({
      id: profile.id, name: profile.name ?? undefined, city: profile.city ?? undefined,
      phone: profile.phone ?? undefined, premium: profile.premium,
    });
  }
  return result;
}
