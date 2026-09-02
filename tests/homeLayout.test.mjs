import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getHomeResponsiveLayout } from "../.test-build/homeLayout.js";

const homeUrl = new URL("../app/home.tsx", import.meta.url);

test("the active FlatList owns the complete natural-height Home header", async () => {
  const source = await readFile(homeUrl, "utf8");

  assert.doesNotMatch(source, /ScrollView/);
  assert.doesNotMatch(source, /maxHeight|height\s*\*\s*0\.55/);
  assert.equal(source.match(/ListHeaderComponent=/g)?.length, 3);
});

test("the recipe list follows the full search and filter row with spacing", async () => {
  const source = await readFile(homeUrl, "utf8");
  const searchRow = source.indexOf("className={`mx-4 mb-3 gap-2");
  const publicList = source.indexOf("ListHeaderComponent={homeHeader}");

  assert.notEqual(searchRow, -1);
  assert.notEqual(publicList, -1);
  assert.ok(searchRow < publicList);
  assert.match(source, /ListHeaderComponent=\{homeHeader\}/);
  assert.match(source, /renderItem=.*?<View className="px-4">/s);
});

test("normal and physical-device layouts remain a single non-clipped row flow", () => {
  for (const width of [375, 390, 393, 430]) {
    const layout = getHomeResponsiveLayout(width, 1);
    assert.equal(layout.stackHeader, false);
    assert.equal(layout.stackSearch, false);
  }
});

test("narrow and accessibility layouts reflow without adding a viewport", async () => {
  const source = await readFile(homeUrl, "utf8");
  for (const [width, fontScale] of [
    [320, 1],
    [390, 1.15],
    [390, 1.35],
    [390, 2],
  ]) {
    const layout = getHomeResponsiveLayout(width, fontScale);
    assert.equal(layout.stackHeader, true);
    assert.equal(layout.stackTabs, true);
    assert.equal(layout.stackSearch, true);
  }

  assert.doesNotMatch(source, /scrollEnabled=/);
  assert.match(source, /multiline=\{responsive\.stackSearch\}/);
  assert.match(source, /responsive\.stackSearch \? "w-full"/);
});
