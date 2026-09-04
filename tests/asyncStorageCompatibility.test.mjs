import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const expoCompatibility = JSON.parse(
  await readFile(
    new URL(
      "../node_modules/expo/bundledNativeModules.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const dependencyName = "@react-native-async-storage/async-storage";
const expoCompatibleVersion = expoCompatibility[dependencyName];

test("AsyncStorage follows Expo SDK's bundled native-module compatibility contract", () => {
  assert.ok(expoCompatibleVersion, "Expo must publish an AsyncStorage compatibility entry");
  assert.equal(packageJson.dependencies[dependencyName], expoCompatibleVersion);

  const installations = Object.entries(packageLock.packages).filter(
    ([path]) => path.endsWith(`node_modules/${dependencyName}`),
  );
  assert.equal(installations.length, 1, "AsyncStorage must resolve exactly once");
  assert.equal(installations[0][1].version, expoCompatibleVersion);
});

test("the SDK-compatible AsyncStorage exposes every adapter API used by the app", async () => {
  const sourcePaths = [
    "src/lib/hasat/introTour.ts",
    "src/lib/hasat/session.ts",
    "src/lib/native/cookSession.ts",
    "src/lib/native/cookTimer.ts",
    "src/lib/native/push.ts",
    "src/lib/supabase/large-secure-store.ts",
  ];
  const sources = await Promise.all(
    sourcePaths.map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")),
  );
  const usedMethods = new Set(
    sources.flatMap((source) =>
      [...source.matchAll(/AsyncStorage\.(\w+)/g)].map((match) => match[1]),
    ),
  );
  const types = await readFile(
    new URL(
      "../node_modules/@react-native-async-storage/async-storage/lib/typescript/types.d.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.deepEqual([...usedMethods].sort(), ["getItem", "removeItem", "setItem"]);
  for (const method of usedMethods) {
    assert.match(types, new RegExp(`\\b${method}\\b`), `${method} must remain supported`);
  }
});
