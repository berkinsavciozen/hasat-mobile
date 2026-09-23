import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("mobile is default-off and owner RPCs use only UX-1F-A signatures", async () => {
  const api = await read("../src/lib/hasat/privateRecipeShare.ts");
  assert.match(api, /EXPO_PUBLIC_UX1F_PRIVATE_RECIPE_SHARE === "true"/);
  assert.match(api, /rpc_create_recipe_share_grant|rpc_list_recipe_share_grants|rpc_rotate_recipe_share_grant|rpc_revoke_recipe_share_grant/);
  assert.doesNotMatch(api, /rpc_generate_recipe_share_token|rpc_get_shared_recipe|rpc_revoke_recipe_share_token/);
});

test("mobile never persists or caches a raw share capability", async () => {
  const api = await read("../src/lib/hasat/privateRecipeShare.ts");
  const panel = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");
  const intent = await read("../app/+native-intent.tsx");
  const all = `${api}\n${panel}\n${intent}`;
  assert.doesNotMatch(all, /AsyncStorage|SecureStore|SQLite|setItem|queryKey:\s*\[[^\]]*token/);
  assert.match(api, /tarif-paylasim#share=/);
  assert.doesNotMatch(all, /[?&]share=/);
  assert.match(intent, /hardened web landing|Never translate it to a query/);
});

test("offline, accessibility, and Sentry boundaries are explicit", async () => {
  const panel = await read("../src/components/hasat/PrivateRecipeSharePanel.tsx");
  const sentry = await read("../src/lib/sentry/sanitize.ts");
  assert.match(panel, /useIsOffline|accessibilityRole="radiogroup"|announceForAccessibility|accessibilityLiveRegion/);
  assert.match(sentry, /share\|p_token|SHARE_FRAGMENT/);
});
