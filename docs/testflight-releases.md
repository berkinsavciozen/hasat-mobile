# TestFlight releases

TestFlight release builds are separate from pull-request validation. Do not
trigger a release until PR #36 is accepted and merged, or an explicit commit SHA
has been approved for release.

An iOS build number is immutable after upload to App Store Connect. Rerunning a
build that was rejected for duplicating an uploaded build number cannot succeed
with that same number. This project therefore uses EAS remote versioning
(`cli.appVersionSource: "remote"`) and `autoIncrement: true` as the build-number
source of truth; do not add a fixed `ios.buildNumber` to source control.

Before a real release, compare the EAS remote counter with the latest build in
App Store Connect. If EAS is behind, stop and deliberately initialize or
synchronize the remote counter before building. A verification run must not
perform that mutation.

The manual workflow requires an explicit repository ref, its expected full
commit SHA, and the latest App Store Connect build number. It verifies those
values before EAS starts, serializes TestFlight releases, and uses EAS
build-and-auto-submit so submission is tied to the exact build produced by that
run. It never selects a separate “latest” build.
