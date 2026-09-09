import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/eas-build-testflight.yml",
  import.meta.url,
);
const easUrl = new URL("../eas.json", import.meta.url);
const appUrl = new URL("../app.json", import.meta.url);

async function runInputNormalizer(env) {
  const workflow = await readFile(workflowUrl, "utf8");
  const match = workflow.match(
    /node <<'NODE'\n([\s\S]*?)\n          NODE/,
  );
  assert.ok(match, "input normalizer script must remain extractable");

  const directory = await mkdtemp(join(tmpdir(), "hasat-testflight-inputs-"));
  const outputPath = join(directory, "github-output");
  try {
    const result = spawnSync(process.execPath, ["-"], {
      input: match[1].replace(/^ {10}/gm, ""),
      encoding: "utf8",
      env: { ...process.env, ...env, GITHUB_OUTPUT: outputPath },
    });
    const output =
      result.status === 0 ? await readFile(outputPath, "utf8") : "";
    return { ...result, output };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("TestFlight inputs are trimmed and validated before checkout", async () => {
  const sha = "00b7fb377818536384d93d5fb659a19c161a9547";
  const accepted = await runInputNormalizer({
    RELEASE_REF_RAW: " main ",
    EXPECTED_SHA_RAW: ` ${sha} `,
    LATEST_ASC_BUILD_NUMBER_RAW: " 7 ",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.output, /^release_ref=main$/m);
  assert.match(accepted.output, new RegExp(`^expected_sha=${sha}$`, "m"));
  assert.match(accepted.output, /^latest_asc_build_number=7$/m);

  for (const value of ["7.0", "7.5", "-1", "", "07", "NaN"]) {
    const rejected = await runInputNormalizer({
      RELEASE_REF_RAW: "main",
      EXPECTED_SHA_RAW: sha,
      LATEST_ASC_BUILD_NUMBER_RAW: value,
    });
    assert.notEqual(rejected.status, 0, `${JSON.stringify(value)} must fail`);
  }

  const badSha = await runInputNormalizer({
    RELEASE_REF_RAW: "main",
    EXPECTED_SHA_RAW: "ABC",
    LATEST_ASC_BUILD_NUMBER_RAW: "7",
  });
  assert.notEqual(badSha.status, 0);
});

test("TestFlight workflow is manual, ref-pinned, and repository-pinned", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request):/m);
  assert.match(workflow, /release_ref:/);
  assert.match(workflow, /expected_sha:/);
  assert.match(workflow, /ref: \$\{\{ steps\.normalized_inputs\.outputs\.release_ref \}\}/);
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
