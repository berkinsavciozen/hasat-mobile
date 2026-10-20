import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile web handoff uses hasat-ai.com", async () => {
  const [webLinks, webLinksAccess, farmerNotice] = await Promise.all([
    read("src/lib/hasat/webLinks.ts"),
    read("src/lib/hasat/webLinksAccess.ts"),
    read("src/components/hasat/FarmerRedirectNotice.tsx"),
  ]);

  assert.match(webLinks, /resolveWebAppUrl/);
  assert.match(webLinksAccess, /https:\/\/hasat-ai\.com/);
  assert.doesNotMatch(`${webLinks}\n${webLinksAccess}\n${farmerNotice}`, /hasat\.lovable\.app/);
});

test("photo permissions describe every pilot photo use", async () => {
  const app = JSON.parse(await read("app.json"));
  const imagePicker = app.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-image-picker",
  );
  assert.ok(imagePicker);

  for (const key of ["photosPermission", "cameraPermission"]) {
    const copy = imagePicker[1][key];
    assert.match(copy, /ürün/i);
    assert.match(copy, /hasat/i);
    assert.match(copy, /parsel/i);
    assert.match(copy, /sertifika/i);
  }
});

test("mobile product flow uses the same harvest-party language as web", async () => {
  const product = await read("app/product/[farmerId]/[crop].tsx");

  assert.match(product, /Hasat partisi/);
  assert.doesNotMatch(product, /`Parti #/);
});
