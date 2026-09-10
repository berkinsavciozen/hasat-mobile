// B-6 (Faz 1) — Sentry'ye giden her breadcrumb/event bu redaksiyondan geçer.
// hasat-mobile'da access_token/refresh_token geçmişte URL fragment'ında
// taşınıyordu (bkz. webLinks.ts → openWebWithSession, T9-nonce dispatch'i).
// Sentry'nin otomatik breadcrumb yakalaması (navigation/fetch/console) aynı
// değerleri yeniden loglayabilir — bu dosya o kanalı kapatır. Zorunlu kural:
// hassas alanı redakte et, breadcrumb'ı/event'i asla tamamen düşürme.
type JsonRecord = Record<string, unknown>;

const SENSITIVE_KEY = /^(access_token|refresh_token|authorization)$/i;
const BEARER_TOKEN = /Bearer\s+\S+/gi;
const TOKEN_QUERY_PARAM = /\b(access_token|refresh_token)=[^&\s]+/gi;
const SUPABASE_JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

function redactString(value: string): string {
  return value
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(TOKEN_QUERY_PARAM, (_match, paramName: string) => `${paramName}=[REDACTED]`)
    .replace(SUPABASE_JWT, "[REDACTED]");
}

function redact(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
    return redactString(value);
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([k, v]) => [k, redact(v, k)]),
    );
  }
  return value;
}

/**
 * Sentry.init'in `beforeBreadcrumb` hook'u — her breadcrumb Sentry'ye
 * gönderilmeden önce buradan geçer, breadcrumb hiçbir zaman düşürülmez.
 */
export function sanitizeBreadcrumb<T>(breadcrumb: T): T {
  return redact(breadcrumb) as T;
}

/**
 * Sentry.init'in `beforeSend` hook'u — event hiçbir zaman düşürülmez,
 * yalnızca içindeki hassas alanlar (varsa breadcrumbs, request, extra, vb.
 * dahil, recursive) redakte edilir.
 */
export function sanitizeEvent<T>(event: T): T {
  return redact(event) as T;
}
