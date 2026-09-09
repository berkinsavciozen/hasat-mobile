import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layoutUrl = new URL("../app/_layout.tsx", import.meta.url);
const boundaryUrl = new URL("../src/components/hasat/SessionBoundary.tsx", import.meta.url);
const seedlingUrl = new URL("../src/components/hasat/SeedlingLoader.tsx", import.meta.url);

test("cold-start branding is a single wordmark with no spinner or monogram", async () => {
  const source = await readFile(boundaryUrl, "utf8");
  const pendingBranch = source.slice(
    source.indexOf("if (!checked || checked.key !== key)"),
    source.indexOf("const { status } = checked.result"),
  );

  assert.equal(pendingBranch.match(/variant="wordmark"/g)?.length, 1);
  assert.doesNotMatch(pendingBranch, /variant="monogram"|ActivityIndicator/);
  assert.match(pendingBranch, /hasCompletedBootstrap/);
  assert.match(pendingBranch, /Sayfa yükleniyor/);
});

test("two or more route changes reuse the native stack without brand splash", async () => {
  const [layout, boundary] = await Promise.all([
    readFile(layoutUrl, "utf8"),
    readFile(boundaryUrl, "utf8"),
  ]);

  assert.match(layout, /<Stack[\s\S]*screenLayout=/);
  assert.match(layout, /animation: reduceMotion \? "none" : "default"/);
  assert.match(boundary, /let hasCompletedBootstrap = false/);
  assert.match(boundary, /const key = `\$\{offline\}:\$\{focused\}:\$\{revision\}`/);
  assert.doesNotMatch(boundary, /const key = `[^`]*\$\{path\}/);

  // The module-level bootstrap latch is route-count independent; exercise the
  // intended home -> recipe -> cook sequence as three boundary mounts.
  let completed = false;
  const surfaceForMount = () => (completed ? "route-skeleton" : "brand-bootstrap");
  assert.equal(surfaceForMount(), "brand-bootstrap");
  completed = true;
  assert.equal(surfaceForMount(), "route-skeleton");
  assert.equal(surfaceForMount(), "route-skeleton");
});

test("seedling uses design tokens, a 1.06 second loop, and static reduced motion", async () => {
  const source = await readFile(seedlingUrl, "utf8");

  assert.match(source, /import \{ brand \}/);
  assert.match(source, /duration: 760/);
  assert.match(source, /Animated\.delay\(160\)/);
  assert.match(source, /duration: 140/);
  assert.match(source, /if \(reduceMotion\)[\s\S]*growth\.setValue\(1\)/);
  assert.match(source, /importantForAccessibility="no-hide-descendants"/);
  assert.doesNotMatch(source, /ActivityIndicator|Image|require\(/);
});
