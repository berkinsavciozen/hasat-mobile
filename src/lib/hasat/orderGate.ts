import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import {
  buildOrderIntentBlockedPayload,
  canStartOrder,
  parseOrderGate,
  type OrderIntentContext,
  type OrderIntentPlatform,
} from "./orderGatePolicy";

export function useOrderGate() {
  const query = useQuery({
    queryKey: ["orderGate"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)(
        "rpc_get_order_gate",
      );
      if (error) throw error;
      return parseOrderGate(data);
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const settled = query.isSuccess && !query.isFetching;
  return {
    ...query,
    // Initial loads, revalidation, malformed data and RPC errors are all
    // deliberately fail-closed; cached permission never opens a stale CTA.
    canStartOrder: settled && canStartOrder(query.data),
    isConfirmedBlocked: settled && !canStartOrder(query.data),
  };
}

function mobilePlatform(): OrderIntentPlatform | null {
  if (Platform.OS === "ios" || Platform.OS === "android") return Platform.OS;
  return null;
}

export function useLogOrderIntentBlocked(
  active: boolean,
  context: OrderIntentContext,
) {
  const sent = useRef(false);

  useEffect(() => {
    const platform = mobilePlatform();
    if (!active || sent.current || !platform) return;
    sent.current = true;

    void (supabase.rpc as any)(
      "rpc_log_order_intent_blocked",
      buildOrderIntentBlockedPayload(context, platform),
    ).catch(() => undefined);
  }, [
    active,
    context.crop,
    context.listingId,
    context.recipeId,
    context.surface,
  ]);
}
