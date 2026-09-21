import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [screenSource, importSource] = await Promise.all([
  readFile(new URL("../app/import.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/hasat/import.ts", import.meta.url), "utf8"),
]);

test("private recipe review UI exposes no new step-photo upload path", () => {
  // UX-1D'nin tarif kaynağı olarak fotoğraf ekleme girişi serbesttir; yasak
  // olan yalnız review içindeki adım fotoğrafı upload CTA'sıdır.
  assert.doesNotMatch(screenSource, /Fotoğraf ekle \(opsiyonel\)/);
  assert.doesNotMatch(screenSource, /pickStepPhoto|uploadStepPhoto|uploadingStepKey/);
  assert.doesNotMatch(importSource, /\.from\(["']recipe-step-photos["']\)\s*\.upload/);
  assert.doesNotMatch(importSource, /export\s+async\s+function\s+uploadStepPhoto/);
});

test("existing step photos remain visible and explicitly removable", () => {
  assert.match(screenSource, /s\.photoUrl\s*&&/);
  assert.match(screenSource, /source=\{\{ uri: s\.photoUrl \}\}/);
  assert.match(screenSource, /Fotoğrafı kaldır/);
  assert.match(screenSource, /photoUrl: null/);
});
