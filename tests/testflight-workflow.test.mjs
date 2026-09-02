import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/eas-build-testflight.yml",
  import.meta.url,
);
const easUrl = new URL("../eas.json", import.meta.url);
const appUrl = new URL("../app.json", import.meta.url);

test("TestFlight workflow is manual, ref-pinned, and repository-pinned", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
  assert.match(workflow, /release_ref:/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /ref: \$\{\{ inputs\.release_ref \}\}/);
  assert.match(workflow, /berkinsavciozen\/hasat-mobile/);
  assert.match(workflow, /RESOLVED_SHA.*git rev-parse HEAD/);
  assert.match(workflow, /RESOLVED_SHA.*EXPECTED_SHA/);
});

test("TestFlight releases serialize without cancelling an active upload", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /group: hasat-mobile-testflight-release/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /queue: max/);
});

test("remote version preflight is read-only and rejects unsafe next builds", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /eas build:version:get[^\n]+--json/);
  assert.doesNotMatch(workflow, /eas build:version:(set|sync)/);
  assert.match(workflow, /REMOTE_BUILD_NUMBER.*LATEST_ASC_BUILD_NUMBER/);
  assert.match(workflow, /NEXT_BUILD_NUMBER.*-lt 3/);

  const eas = JSON.parse(await readFile(easUrl, "utf8"));
  const app = JSON.parse(await readFile(appUrl, "utf8"));
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.equal(eas.build["ios-testflight"].autoIncrement, true);
  assert.equal(app.expo.version, "1.0.0");
  assert.equal(app.expo.ios?.buildNumber, undefined);
});

test("submission is coupled to the current build and never uses latest", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /eas build \\/);
  assert.match(workflow, /--auto-submit-with-profile/);
  assert.match(workflow, /--wait/);
  assert.doesNotMatch(workflow, /eas submit/);
  assert.doesNotMatch(workflow, /--latest/);
});
