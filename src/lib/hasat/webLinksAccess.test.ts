// Run with: node --experimental-strip-types --test src/lib/hasat/webLinksAccess.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebSessionUrl } from "./webLinksAccess.ts";

const WEB_APP_URL = "https://hasat.example";
const PATH = "/buyer/orders/abc";

test("active session + successful nonce issue -> nonce URL, not the raw tokens", async () => {
  const url = await resolveWebSessionUrl(WEB_APP_URL, PATH, {
    refreshSession: async () => ({ session: { access_token: "at", refresh_token: "rt" } }),
    issueHandoffNonce: async (refreshToken, path) => {
      assert.equal(refreshToken, "rt");
      assert.equal(path, PATH);
      return { nonce: "n0nce-value" };
    },
  });
  assert.equal(url, `${WEB_APP_URL}/auth/mobile-handoff#nonce=n0nce-value&next=${encodeURIComponent(PATH)}`);
  assert.ok(!url.includes("access_token"));
  assert.ok(!url.includes("refresh_token"));
});

test("no active/refreshable session (refreshSession failure) -> plain URL, no crash (regression)", async () => {
  const url = await resolveWebSessionUrl(WEB_APP_URL, PATH, {
    refreshSession: async () => ({ session: null }),
    issueHandoffNonce: async () => {
      throw new Error("must not be called when there is no session");
    },
  });
  assert.equal(url, `${WEB_APP_URL}${PATH}`);
});

test("session present but nonce-issue call fails (returns null) -> falls back to plain URL", async () => {
  const url = await resolveWebSessionUrl(WEB_APP_URL, PATH, {
    refreshSession: async () => ({ session: { access_token: "at", refresh_token: "rt" } }),
    issueHandoffNonce: async () => null,
  });
  assert.equal(url, `${WEB_APP_URL}${PATH}`);
});

test("session present but nonce-issue call throws -> falls back to plain URL, does not propagate", async () => {
  const url = await resolveWebSessionUrl(WEB_APP_URL, PATH, {
    refreshSession: async () => ({ session: { access_token: "at", refresh_token: "rt" } }),
    issueHandoffNonce: async () => {
      throw new Error("network error");
    },
  });
  assert.equal(url, `${WEB_APP_URL}${PATH}`);
});

test("session missing access_token or refresh_token -> treated as no session", async () => {
  const url = await resolveWebSessionUrl(WEB_APP_URL, PATH, {
    // @ts-expect-error partial session on purpose
    refreshSession: async () => ({ session: { access_token: "at", refresh_token: "" } }),
    issueHandoffNonce: async () => {
      throw new Error("must not be called");
    },
  });
  assert.equal(url, `${WEB_APP_URL}${PATH}`);
});
