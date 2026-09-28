export interface OrderGate {
  ordersEnabled: boolean;
  callerAllowed: boolean;
}

export type OrderIntentSurface =
  | "recipe_product"
  | "discover"
  | "storefront"
  | "producer"
  | "offer_route"
  | "subscription"
  | "mcp";

export type OrderIntentPlatform = "ios" | "android";

export interface OrderIntentContext {
  surface: OrderIntentSurface;
  listingId?: string | null;
  recipeId?: string | null;
  crop?: string | null;
}

export function parseOrderGate(data: unknown): OrderGate {
  const value = Array.isArray(data) ? data[0] : data;
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as OrderGate).ordersEnabled !== "boolean" ||
    typeof (value as OrderGate).callerAllowed !== "boolean"
  ) {
    throw new Error("INVALID_ORDER_GATE");
  }
  return value as OrderGate;
}

export function canStartOrder(gate: OrderGate | null | undefined): boolean {
  return gate?.ordersEnabled === true || gate?.callerAllowed === true;
}

export function isOrdersDisabledError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "message" in error &&
    (error as { message?: unknown }).message === "ORDERS_DISABLED"
  );
}

export function buildOrderIntentBlockedPayload(
  context: OrderIntentContext,
  platform: OrderIntentPlatform,
): Record<string, string> {
  const payload: Record<string, string> = {
    p_surface: context.surface,
    p_platform: platform,
  };
  if (context.listingId) payload.p_listing_id = context.listingId;
  if (context.recipeId) payload.p_recipe_id = context.recipeId;
  if (context.crop) payload.p_crop = context.crop;
  return payload;
}
