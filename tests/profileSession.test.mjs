import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(path, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unmocked import ${name}`);
    return mocks[name];
  }, URL });
  return exports;
}
const policy = load("src/lib/hasat/profileSession.ts");
const active = (role = "buyer") => ({ id: "user-a", role, deleted_at: null, name: "Example", phone: null, city: null, premium: false });
const deps = (data) => ({ getSession: async () => ({ userId: "user-a", error: null }), getProfile: async () => ({ data, error: null }) });
for (const role of ["buyer", "farmer"]) {
  test(`${role}: null deleted_at is active; populated deleted_at is invalid`, async () => {
    assert.equal((await policy.inspectProfileSession(deps(active(role)))).status, "active");
    assert.equal((await policy.inspectProfileSession(deps({ ...active(role), deleted_at: "2026-09-01T00:00:00Z" }))).status, "invalid");
  });
}
test("missing profile is invalid; missing schema field cannot authorize", async () => {
  assert.equal((await policy.inspectProfileSession(deps(null))).status, "invalid");
  assert.equal((await policy.inspectProfileSession(deps({ ...active(), deleted_at: undefined }))).status, "unavailable");
});
test("offline refresh / transient errors preserve credentials, explicit auth rejection invalidates", async () => {
  for (const error of [{ name: "AuthRetryableFetchError" }, { message: "Network request failed" }, { status: 503 }]) {
    const d = deps(active()); d.getSession = async () => ({ userId: null, error });
    assert.equal((await policy.inspectProfileSession(d)).status, "unavailable");
  }
  const d = deps(active()); d.getSession = async () => ({ userId: null, error: { status: 401, message: "fetch rejected" } });
  assert.equal((await policy.inspectProfileSession(d)).status, "invalid");
});
test("profile errors (offline, RLS, undeployed column) never imply deletion", async () => {
  for (const error of [{ message: "fetch failed" }, { status: 403 }, { code: "42703" }]) {
    const d = deps(null); d.getProfile = async () => ({ data: null, error });
    assert.equal((await policy.inspectProfileSession(d)).status, "unavailable");
  }
  const d = deps(null); d.getProfile = async () => { throw Error("offline"); };
  assert.equal((await policy.inspectProfileSession(d)).status, "unavailable");
});

function runtime(profile, { sessionError = null, signOutThrows = false, switchUserDuringProfile = false } = {}) {
  let uid = "user-a";
  const events = []; let callback;
  const state = { user: { id: uid }, roleResolvedForUserId: uid, clear() { events.push("store"); this.user = null; this.roleResolvedForUserId = null; }, clearRoleResolution() { this.roleResolvedForUserId = null; }, setRole(role, id) { events.push(`role:${role}`); this.roleResolvedForUserId = id; }, updateUser(user) { this.user = user; } };
  const store = { getState: () => state, persist: { hasHydrated: () => true } };
  const supabase = { auth: {
    getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null }, error: sessionError }),
    stopAutoRefresh: async () => events.push("stop"),
    signOut: async (options) => { assert.equal(options.scope, "local"); assert.equal(uid, null); events.push("signOut"); callback?.("SIGNED_OUT"); if (signOutThrows) throw Error("sdk failure"); return { error: null }; },
    onAuthStateChange: (cb) => { callback = cb; },
  }, from: (table) => { assert.equal(table, "profiles"); return { select: (fields) => { assert.match(fields, /deleted_at/); return { eq: (_, id) => { assert.equal(id, "user-a"); return { maybeSingle: async () => { if (switchUserDuringProfile) uid = "user-b"; return { data: profile, error: null }; } }; } }; } }; } };
  const mocks = {
    "@/lib/supabase/client": { supabase, removeLocalAuthStorage: async () => { events.push("authStorage"); uid = null; } },
    "@/lib/store/session": { useHasatMobileSession: store, flushSessionStorage: async () => events.push("persisted") },
    "@/lib/query/client": { queryClient: { cancelQueries: async () => events.push("cancel"), clear: () => events.push("query") } },
    "@/lib/offline/db": { clearRecipeCache: async () => events.push("sqlite") },
    "expo-network": { getNetworkStateAsync: async () => { throw Error("must not gate confirmed deletion"); } },
    "expo-router": { router: { replace: () => events.push("redirect") } },
  };
  const guard = load("src/lib/hasat/sessionGuard.ts", mocks);
  guard.installSessionGuard();
  const validation = load("src/lib/hasat/validateSession.ts", { ...mocks, "./profileSession": policy, "./sessionGuard": guard });
  return { ...validation, guard, state, events };
}
for (const role of ["buyer", "farmer"]) {
  test(`${role}: actual cold-start validator cleans JWT/store/query/sqlite for deleted profile`, async () => {
    const r = runtime({ ...active(role), deleted_at: "2026-09-01" });
    assert.equal((await r.validateSession()).status, "invalid");
    assert.equal(r.state.user, null);
    assert.equal(r.state.roleResolvedForUserId, null);
    for (const event of ["stop", "authStorage", "signOut", "cancel", "query", "sqlite"]) assert.ok(r.events.includes(event));
    assert.ok(r.events.indexOf("authStorage") < r.events.indexOf("signOut"));
    assert.ok(!r.events.some((event) => event.startsWith("role:")));
  });
  test(`${role}: actual validator resolves active profile`, async () => {
    const r = runtime(active(role));
    assert.equal((await r.validateSession()).status, "active");
    assert.ok(r.events.includes(`role:${role}`));
    assert.ok(!r.events.includes("authStorage"));
  });
}
test("retryable auth failure does not clear stored user or session", async () => {
  const r = runtime(null, { sessionError: { name: "AuthRetryableFetchError" } });
  assert.equal((await r.validateSession()).status, "unavailable");
  assert.equal(r.state.user.id, "user-a");
  assert.equal(r.state.roleResolvedForUserId, null);
  assert.equal(r.events.length, 0);
});
test("in-app cleanup runs even if SDK signOut throws", async () => {
  const r = runtime(null, { signOutThrows: true });
  await assert.rejects(r.guard.invalidateProfileSession(), /sdk failure/);
  assert.equal(r.state.user, null);
  assert.ok(r.events.includes("sqlite"));
});
test("protected deep links are denied while offline; public recipe routes remain reachable", () => {
  for (const path of ["/onboarding", "/profile", "/orders", "/offer/confirm", "/offer/id", "/notifications", "/notif-prefs", "/import"]) assert.equal(policy.isPublicSessionPath(path), false);
  for (const path of ["/", "/home", "/recipe/slug", "/cook/slug", "/login"]) assert.equal(policy.isPublicSessionPath(path), true);
});

// Execute the actual screen boundary render using controlled hook snapshots.
function renderBoundary(path, status, checkedKey = null) {
  const key = "false:true:0";
  const states = [true, 0, status ? { key: checkedKey ?? key, result: { status } } : null];
  const component = load("src/components/hasat/SessionBoundary.tsx", {
    react: { useState: () => [states.shift(), () => {}], useEffect() {}, useCallback: (fn) => fn },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "expo-router": { Redirect: "Redirect", usePathname: () => path, useFocusEffect() {} },
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable" },
    "@/components/hasat/BrandLogo": { BrandLogo: "BrandLogo" },
    "@/components/hasat/SeedlingLoader": { SeedlingLoader: "SeedlingLoader" },
    "@/lib/net/useIsOffline": { useIsOffline: () => false },
    "@/lib/supabase/client": {}, "@/lib/hasat/validateSession": {},
    "@/lib/hasat/profileSession": policy,
  });
  return component.SessionBoundary({ children: "SCREEN" });
}
test("cold-start and deep-link boundary never mounts children until validation", () => {
  for (const path of ["/", "/profile", "/orders", "/offer/confirm", "/home"]) {
    assert.notEqual(renderBoundary(path, null), "SCREEN");
    assert.equal(renderBoundary(path, "invalid").props.href, "/login");
    assert.equal(renderBoundary(path, "active"), "SCREEN");
    assert.notEqual(renderBoundary(path, "active", "previous-route"), "SCREEN");
  }
});
test("unavailable/guest deep link blocked while offline editorial route stays open", () => {
  assert.notEqual(renderBoundary("/orders", "unavailable"), "SCREEN");
  assert.equal(renderBoundary("/orders", "guest").props.href, "/login");
  assert.equal(renderBoundary("/recipe/slug", "unavailable"), "SCREEN");
});

test("known-offline bootstrap preserves cached user without attempting network auth", async () => {
  const r = runtime(active());
  assert.equal((await r.validateSession(true)).status, "unavailable");
  assert.equal(r.state.user.id, "user-a");
  assert.equal(r.state.roleResolvedForUserId, null);
  assert.equal(r.events.length, 0);
});

test("installed Supabase SDK clears auth state after local storage removal without logout network", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = "sb-example-auth-token";
  const values = new Map([[key, JSON.stringify({
    access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { id: "user-a" },
  })]]);
  let requests = 0;
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, storage: {
      getItem: async (k) => values.get(k) ?? null,
      setItem: async (k, v) => { values.set(k, v); },
      removeItem: async (k) => { values.delete(k); },
    } },
    global: { fetch: async () => { requests++; throw Error("network forbidden"); } },
  });
  assert.equal((await client.auth.getSession()).data.session.user.id, "user-a");
  await client.auth.stopAutoRefresh();
  values.delete(key);
  let signedOut = false;
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") signedOut = true; });
  assert.equal((await client.auth.signOut({ scope: "local" })).error, null);
  assert.equal((await client.auth.getSession()).data.session, null);
  assert.equal(requests, 0);
  assert.equal(signedOut, true);
  subscription.unsubscribe();
});

test("Zustand flush orders clear after earlier writes and never hydrates a resolved role", async () => {
  const zustand = await import("zustand");
  const middleware = await import("zustand/middleware");
  const values = new Map([["hasat-mobile-session", JSON.stringify({ state: {
    user: { id: "old-user" }, role: "farmer", roleResolvedForUserId: "old-user",
  }, version: 0 })]]);
  const writes = [];
  const module = load("src/lib/store/session.ts", {
    zustand, "zustand/middleware": middleware,
    "@/lib/supabase/large-secure-store": { LargeSecureStore: class {
      async getItem(key) { return values.get(key) ?? null; }
      async setItem(key, value) { await new Promise((resolve) => setTimeout(resolve, 2)); writes.push(value); values.set(key, value); }
      async removeItem(key) { values.delete(key); }
    } },
  });
  const store = module.useHasatMobileSession;
  await store.persist.rehydrate();
  assert.equal(store.getState().roleResolvedForUserId, null);
  store.getState().updateUser({ id: "user-a" });
  store.getState().setRole("buyer", "user-a");
  store.getState().clear();
  await module.flushSessionStorage();
  assert.equal(JSON.parse(writes.at(-1)).state.user, null);
  assert.equal(JSON.parse(values.get("hasat-mobile-session")).state.roleResolvedForUserId, null);
});

test("late profile response cannot restore or invalidate a different signed-in user", async () => {
  for (const deleted_at of [null, "2026-09-01"]) {
    const r = runtime({ ...active(), deleted_at }, { switchUserDuringProfile: true });
    assert.equal((await r.validateSession()).status, "unavailable");
    assert.ok(!r.events.includes("authStorage"));
    assert.ok(!r.events.some((event) => event.startsWith("role:")));
  }
});
