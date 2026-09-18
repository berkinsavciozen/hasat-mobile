import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("private edit eski transaction-dışı parent/child yazımlarını kullanmaz", async () => {
  const source = await read("../src/lib/hasat/import.ts");
  assert.match(source, /updatePrivateRecipe\(/);
  assert.match(source, /expectedVersion: draft\.privateEditVersion/);
  assert.doesNotMatch(source, /from\("recipes"\)\s*\.update\(/);
  assert.doesNotMatch(source, /from\("recipe_ingredients"\)\s*\.delete\(/);
  assert.doesNotMatch(source, /from\("recipe_steps"\)\s*\.delete\(/);
});

test("OCR ve T7a mobil çağrıları operation_key taşır; ikinci client create yazımı yoktur", async () => {
  const [ocr, t7a, screen] = await Promise.all([
    read("../src/lib/hasat/import.ts"),
    read("../src/lib/hasat/photoEstimate.ts"),
    read("../app/import.tsx"),
  ]);
  assert.match(ocr, /operation_key: input\.operationKey/);
  assert.match(t7a, /operation_key: input\.operationKey/);
  assert.match(screen, /createOperationKeys\.current\.acquire\(operationIdentity\)/);
  assert.match(screen, /createOperationKeys\.current\.succeed\(operationIdentity, operationKey\)/);
  assert.doesNotMatch(ocr, /rpc_create_private_recipe/);
  assert.doesNotMatch(t7a, /rpc_create_private_recipe/);
});

test("T6 anahtarı korunur ve typed RPC kullanır", async () => {
  const [adapter, screen] = await Promise.all([
    read("../src/lib/hasat/customizeRecipe.ts"),
    read("../app/recipe-customize.tsx"),
  ]);
  assert.match(adapter, /p_idempotency_key: input\.idempotencyKey/);
  assert.match(screen, /const \[idempotencyKey\] = useState\(\(\) => newIdempotencyKey\(\)\)/);
  assert.doesNotMatch(adapter, /supabase\.rpc as any/);
});

test("mutation başarısızken liste/cache başarı gibi güncellenmez ve stale reload yolu görünürdür", async () => {
  const [screen, cache] = await Promise.all([
    read("../app/import.tsx"),
    read("../src/lib/offline/recipeCache.ts"),
  ]);
  const saveAt = screen.indexOf("await saveDraft(draft, updateOperationKeys.current)");
  const invalidateAt = screen.indexOf("queryClient.invalidateQueries", saveAt);
  assert.ok(saveAt >= 0 && invalidateAt > saveAt);
  assert.match(screen, /e\.code === "version_conflict"/);
  assert.match(screen, /Güncel halini yeniden yükle/);
  assert.match(screen, /if \(isOffline\)/);
  assert.doesNotMatch(cache, /myRecipes|private_edit_version|operation_key/);
});

test("normal kullanıcı mutation payload'larında public/published veya rol alanı bulunmaz", async () => {
  const adapter = await read("../src/lib/hasat/privateRecipeMutations.ts");
  assert.doesNotMatch(adapter, /visibility\s*:/);
  assert.doesNotMatch(adapter, /status\s*:/);
  assert.doesNotMatch(adapter, /author_type\s*:/);
  assert.doesNotMatch(adapter, /owner_id\s*:/);
  assert.doesNotMatch(adapter, /get_my_role|farmer|buyer/);
});

test("generated types atomik RPC ve optimistic version sözleşmesini açıkça içerir", async () => {
  const types = await read("../src/lib/core/db/types.ts");
  assert.match(types, /private_edit_version: number/);
  assert.match(types, /rpc_update_private_recipe:[\s\S]*p_expected_version: number/);
  assert.match(types, /rpc_clone_recipe:[\s\S]*p_operation_key: string/);
  assert.match(types, /rpc_create_private_recipe:[\s\S]*p_operation_type: string/);
});
