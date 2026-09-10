import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sanitizeBreadcrumb, sanitizeEvent } from "../.test-build/sanitize.js";

const SUPABASE_LIKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.dGhpc19pc19hX2Zha2Vfc2lnbmF0dXJl";

test("a fetch breadcrumb carrying an Authorization: Bearer <jwt> header is redacted, not dropped", () => {
  const breadcrumb = {
    type: "http",
    category: "fetch",
    data: {
      method: "GET",
      url: "https://efuqpiaavrzimvstpdpm.supabase.co/rest/v1/profiles",
      status_code: 200,
      __span: "abc123",
      request_headers: {
        Authorization: `Bearer ${SUPABASE_LIKE_JWT}`,
        "Content-Type": "application/json",
      },
    },
  };

  const sanitized = sanitizeBreadcrumb(breadcrumb);

  // Never dropped: same shape, still a breadcrumb with the same category/data keys.
  assert.equal(sanitized.type, "http");
  assert.equal(sanitized.category, "fetch");
  assert.equal(sanitized.data.method, "GET");
  assert.equal(sanitized.data.status_code, 200);
  assert.equal(sanitized.data.__span, "abc123");

  // The sensitive value itself must never reach Sentry.
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  assert.doesNotMatch(serialized, new RegExp(SUPABASE_LIKE_JWT));
  assert.equal(sanitized.data.request_headers.Authorization, "[REDACTED]");
  assert.equal(sanitized.data.request_headers["Content-Type"], "application/json");
});

test("access_token/refresh_token keys are fully redacted wherever they appear", () => {
  const event = {
    message: "session refresh failed",
    extra: {
      session: {
        access_token: SUPABASE_LIKE_JWT,
        refresh_token: "v1.MRlXsome-opaque-refresh-token-value",
        expires_in: 3600,
      },
    },
  };

  const sanitized = sanitizeEvent(event);

  assert.equal(sanitized.message, "session refresh failed");
  assert.equal(sanitized.extra.session.access_token, "[REDACTED]");
  assert.equal(sanitized.extra.session.refresh_token, "[REDACTED]");
  assert.equal(sanitized.extra.session.expires_in, 3600);
});

test("a webLinks.ts-style mobile-handoff URL breadcrumb has its token params redacted in place", () => {
  // Mirrors src/lib/hasat/webLinks.ts openWebWithSession: access_token/refresh_token
  // travel in the URL fragment. A navigation/Linking breadcrumb could log this
  // whole string; the redaction must not require a dedicated "url" key to work.
  const at = encodeURIComponent(SUPABASE_LIKE_JWT);
  const rt = encodeURIComponent("v1.opaque-refresh-token");
  const url =
    `https://hasat.lovable.app/auth/mobile-handoff#access_token=${at}&refresh_token=${rt}&next=%2Fprofile`;

  const breadcrumb = {
    type: "navigation",
    category: "navigation",
    data: { to: url },
  };

  const sanitized = sanitizeBreadcrumb(breadcrumb);

  assert.equal(sanitized.type, "navigation");
  assert.doesNotMatch(sanitized.data.to, /access_token=(?!\[REDACTED\])/);
  assert.doesNotMatch(sanitized.data.to, /refresh_token=(?!\[REDACTED\])/);
  assert.match(sanitized.data.to, /^https:\/\/hasat\.lovable\.app\/auth\/mobile-handoff#/);
  assert.match(sanitized.data.to, /next=%2Fprofile/);
});

test("breadcrumbs and events with no sensitive data pass through unchanged", () => {
  const breadcrumb = {
    type: "default",
    category: "console",
    message: "Recipe list refreshed",
    data: { count: 12 },
  };

  assert.deepEqual(sanitizeBreadcrumb(breadcrumb), breadcrumb);
});

test("sanitize.ts exports are the only redaction surface init.ts relies on", async () => {
  const initSource = await readFile(new URL("../src/lib/sentry/init.ts", import.meta.url), "utf8");
  assert.match(initSource, /beforeBreadcrumb\(breadcrumb\)\s*\{\s*return sanitizeBreadcrumb\(breadcrumb\);/);
  assert.match(initSource, /beforeSend\(event\)\s*\{\s*return sanitizeEvent\(event\);/);
  assert.match(initSource, /tracesSampleRate:\s*0,/);
});
