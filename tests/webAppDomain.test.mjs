import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_WEB_APP_URL, resolveWebAppUrl } from "../src/lib/hasat/webLinksAccess.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) out.push(...(await sourceFiles(`${path}/`)));
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("web app URL defaults to hasat-ai.com when EXPO_PUBLIC_WEB_APP_URL is unset", () => {
  assert.equal(DEFAULT_WEB_APP_URL, "https://hasat-ai.com");
  assert.equal(resolveWebAppUrl(undefined), "https://hasat-ai.com");
  assert.equal(resolveWebAppUrl("https://preview.example"), "https://preview.example");
});

test("webLinks.ts resolves WEB_APP_URL through the shared default, env var read statically", async () => {
  const source = await read("src/lib/hasat/webLinks.ts");
  assert.match(
    source,
    /export const WEB_APP_URL = resolveWebAppUrl\(process\.env\.EXPO_PUBLIC_WEB_APP_URL\);/,
  );
});

test("default host matches the iOS associated domain", async () => {
  const appJson = JSON.parse(await read("app.json"));
  const host = new URL(DEFAULT_WEB_APP_URL).host;
  assert.ok(appJson.expo.ios.associatedDomains.includes(`applinks:${host}`));
});

test("FarmerRedirectNotice derives its visible host from WEB_APP_URL (-> hasat-ai.com)", async () => {
  const source = await read("src/components/hasat/FarmerRedirectNotice.tsx");
  assert.match(source, /WEB_APP_HOST = WEB_APP_URL\.replace\(\/\^https\?:\\\/\\\/\/, ""\)/);
  assert.equal(resolveWebAppUrl(undefined).replace(/^https?:\/\//, ""), "hasat-ai.com");
});

test("no lovable.app host remains in app code or config", async () => {
  const files = [
    ...(await sourceFiles("app/")),
    ...(await sourceFiles("src/")),
    "app.json",
    "eas.json",
  ];
  for (const file of files) {
    assert.doesNotMatch(await read(file), /lovable\.app/, file);
  }
});
