import { supabase } from "@/lib/supabase/client";
import { uuidv4 } from "@/lib/hasat/uuid";
import type { Json } from "@/lib/core/db/types";

export interface RetryOperationKeyStore {
  acquire(identity: string): string;
  succeed(identity: string, key: string): void;
}

export function createRetryOperationKeyStore(
  generate: () => string = uuidv4,
): RetryOperationKeyStore {
  let current: { identity: string | null; key: string } = {
    identity: null,
    key: generate(),
  };

  return {
    acquire(identity) {
      if (current.identity !== identity) {
        current = {
          identity,
          key: current.identity === null ? current.key : generate(),
        };
      }
      return current.key;
    },
    succeed(identity, key) {
      if (current.identity === identity && current.key === key) {
        current = { identity: null, key: generate() };
      }
    },
  };
}

export type PrivateRecipeMutationErrorCode =
  | "version_conflict"
  | "idempotency_conflict"
  | "authentication_required"
  | "source_not_eligible"
  | "invalid_response"
  | "unknown";

const USER_MESSAGES: Record<PrivateRecipeMutationErrorCode, string> = {
  version_conflict:
    "Bu tarif başka bir yerde değiştirildi. Sunucudaki güncel halini yeniden yükleyip tekrar deneyebilirsin.",
  idempotency_conflict:
    "Bu kayıt isteği artık geçerli değil. İçeriği kontrol edip yeniden deneyebilirsin.",
  authentication_required: "Oturumun sona ermiş olabilir. Yeniden giriş yapıp tekrar dene.",
  source_not_eligible: "Bu tarif bağımsız olarak klonlanamıyor.",
  invalid_response: "İşlem tamamlanamadı. Tekrar dener misin?",
  unknown: "İşlem tamamlanamadı. Bağlantını kontrol edip tekrar dene.",
};

export class PrivateRecipeMutationError extends Error {
  code: PrivateRecipeMutationErrorCode;

  constructor(code: PrivateRecipeMutationErrorCode) {
    super(USER_MESSAGES[code]);
    this.code = code;
    this.name = "PrivateRecipeMutationError";
  }
}

function mapRpcError(error: unknown): PrivateRecipeMutationError {
  const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const sqlState = typeof value?.code === "string" ? value.code : "";
  const text = [value?.message, value?.details, value?.hint]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  if (sqlState === "40001" || text.includes("private_recipe_version_conflict"))
    return new PrivateRecipeMutationError("version_conflict");
  if (text.includes("private_recipe_idempotency_conflict"))
    return new PrivateRecipeMutationError("idempotency_conflict");
  if (text.includes("source_recipe_not_eligible") || text.includes("source_not_eligible"))
    return new PrivateRecipeMutationError("source_not_eligible");
  if (
    sqlState === "42501" ||
    text.includes("authentication_required") ||
    text.includes("jwt") ||
    text.includes("not authenticated")
  )
    return new PrivateRecipeMutationError("authentication_required");
  return new PrivateRecipeMutationError("unknown");
}

export interface PrivateRecipeRpcResult {
  recipeId: string;
  version: number;
}

function parseResult(data: Json): PrivateRecipeRpcResult {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new PrivateRecipeMutationError("invalid_response");
  const recipeId = data.recipe_id;
  const version = data.version;
  if (typeof recipeId !== "string" || typeof version !== "number" || version < 1)
    throw new PrivateRecipeMutationError("invalid_response");
  return { recipeId, version };
}

export async function updatePrivateRecipe(input: {
  recipeId: string;
  expectedVersion: number;
  payload: Json;
  operationKeys: RetryOperationKeyStore;
}): Promise<PrivateRecipeRpcResult> {
  const identity = JSON.stringify({
    recipeId: input.recipeId,
    expectedVersion: input.expectedVersion,
    payload: input.payload,
  });
  const operationKey = input.operationKeys.acquire(identity);
  const { data, error } = await supabase.rpc("rpc_update_private_recipe", {
    p_operation_key: operationKey,
    p_recipe_id: input.recipeId,
    p_expected_version: input.expectedVersion,
    p_payload: input.payload,
  });
  if (error) throw mapRpcError(error);
  const result = parseResult(data);
  input.operationKeys.succeed(identity, operationKey);
  return result;
}

export async function clonePrivateRecipe(input: {
  sourceRecipeId: string;
  operationKeys: RetryOperationKeyStore;
}): Promise<PrivateRecipeRpcResult> {
  const identity = `clone:${input.sourceRecipeId}`;
  const operationKey = input.operationKeys.acquire(identity);
  const { data, error } = await supabase.rpc("rpc_clone_recipe", {
    p_source_recipe_id: input.sourceRecipeId,
    p_operation_key: operationKey,
  });
  if (error) throw mapRpcError(error);
  const result = parseResult(data);
  input.operationKeys.succeed(identity, operationKey);
  return result;
}
