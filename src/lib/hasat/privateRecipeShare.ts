import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { WEB_APP_URL } from "./webLinks";
export { shareExpiry } from "./recipeShareExpiry";

export const PRIVATE_RECIPE_SHARE_ENABLED =
  process.env.EXPO_PUBLIC_UX1F_PRIVATE_RECIPE_SHARE === "true";

export interface RecipeShareGrant {
  grant_id: string;
  expires_at: string;
  status: "active" | "expired" | "rotated" | "revoked";
}

function requireEnabled(): void {
  if (!PRIVATE_RECIPE_SHARE_ENABLED) throw new Error("recipe_share_feature_disabled");
}

export function privateRecipeShareUrl(token: string): string {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("recipe_share_invalid_or_inactive");
  return `${WEB_APP_URL.replace(/\/$/, "")}/tarif-paylasim#share=${token}`;
}

export function useRecipeShareGrants(recipeId: string) {
  return useQuery({
    queryKey: ["recipeShareGrants", recipeId],
    enabled: PRIVATE_RECIPE_SHARE_ENABLED && !!recipeId,
    queryFn: async (): Promise<RecipeShareGrant[]> => {
      requireEnabled();
      const { data, error } = await (supabase.rpc as any)("rpc_list_recipe_share_grants", {
        p_recipe_id: recipeId,
      });
      if (error) throw error;
      return (data ?? []) as RecipeShareGrant[];
    },
  });
}

export function useCreateRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (expiresAt: string): Promise<{ token: string }> => {
      requireEnabled();
      const { data, error } = await (supabase.rpc as any)("rpc_create_recipe_share_grant", {
        p_recipe_id: recipeId,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data as { token: string };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}

export function useRotateRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ grantId, expiresAt }: { grantId: string; expiresAt: string }): Promise<{ token: string }> => {
      requireEnabled();
      const { data, error } = await (supabase.rpc as any)("rpc_rotate_recipe_share_grant", {
        p_grant_id: grantId,
        p_expires_at: expiresAt,
      });
      if (error) throw error;
      return data as { token: string };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}

export function useRevokeRecipeShareGrant(recipeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (grantId: string) => {
      requireEnabled();
      const { error } = await (supabase.rpc as any)("rpc_revoke_recipe_share_grant", {
        p_grant_id: grantId,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["recipeShareGrants", recipeId] }),
  });
}
