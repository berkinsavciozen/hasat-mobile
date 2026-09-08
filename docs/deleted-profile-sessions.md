# Deleted profile sessions (B-9 Phase 0)

A device can retain an unexpired JWT after the account is deleted elsewhere.
`getSession()` and the old `profiles.role` alone cannot establish that this
account is still active. Mobile now reads `profiles.deleted_at` before mounting
screens, including cold starts and direct deep links. It repeats validation on
navigation/focus, foreground entry, auth changes and network recovery.

The coordinated web/schema change must deploy first: `profiles.deleted_at` is a
nullable `timestamptz`, and `rpc_delete_own_account` sets it atomically. The mobile
Row/Insert/Update types reflect that approved contract; this PR does not generate
or apply a migration. The own-profile SELECT policy must expose the field. A
successful empty profile response is inactive; a failed query or absent schema
field is unavailable, not proof of account deletion. No name-based heuristic is
used. Buyer and farmer profiles follow the same checks.

## Cleanup and offline behavior

Confirmed inactive profiles clear the Zustand user/role, cancel and clear query
cache, await the SQLite recipe-cache cleanup and serialized Zustand persistence,
remove the existing Supabase encrypted local session keys, then use the SDK's
public local sign-out API. Removing storage first avoids a logout/refresh network
dependency. Existing storage key names, encrypted storage format and PR #38's
Expo-compatible AsyncStorage version remain unchanged. Successful in-app deletion
uses the same cleanup; its existing intro-tour cleanup and RPC ordering remain.
Normal manual global sign-out and push-token removal remain unchanged.

On known offline startup, no auth/profile network request is made. Retryable auth
or profile failures retain local credentials and cached user information, but do
not resolve a role or mount protected screens. Existing public home, recipe,
cooking and product routes remain available; only editorial recipes are stored
in SQLite. Protected routes show a retry action and recheck on reconnection.
A missing session routes protected screens to login. Confirmed deletion routes
to login regardless of network status at cleanup time.

Offline devices cannot learn about a remote deletion until connectivity returns.
Cached information is not a fresh account-status decision. This is a client guard,
not a substitute for the coordinated server/RLS authorization contract; an account
can also change after a successful check. No production writes or real deletions
were used for verification.

## Verification

Use the lockfile dependencies (`npm ci`), then:

```sh
npm run typecheck
./node_modules/.bin/tsc --ignoreConfig --target es2022 --module commonjs --outDir .test-build src/lib/hasat/introTourPersistence.ts src/lib/hasat/introTourEvaluator.ts src/lib/hasat/deleteAccount.ts
./node_modules/.bin/tsc --ignoreConfig --target es2022 --module commonjs --outDir .test-build src/lib/native/homeLayout.ts
node --test tests/*.test.mjs
CI=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform ios --output-dir /tmp/hasat-b9-ios
CI=1 EXPO_NO_TELEMETRY=1 ./node_modules/.bin/expo export --platform android --output-dir /tmp/hasat-b9-android
```

The session tests execute the actual policy, validator, cleanup and boundary code
with controlled adapters and render snapshots. They also exercise real Zustand
persistence and the installed Supabase SDK with memory storage and forbidden
network access. These are not native end-to-end tests. The existing tests cover
intro-tour deletion ordering, Home layout, AsyncStorage compatibility and release
workflow constraints. Export output and `.test-build` are local artifacts only.

## Post-deploy real-device acceptance matrix

Pending: execute every row on both a physical iPhone and Android device, for both
buyer and farmer test accounts in an approved test environment. Do not record
phone numbers, OTPs or tokens in evidence. Keep an unexpired session on the device
for the deletion scenarios; do not clear app storage before testing.

| Scenario | Expected result |
| --- | --- |
| Active profile (`deleted_at = null`), cold start | Correct current role; normal home/onboarding routing |
| Active profile, direct `/profile`, `/orders`, `/offer/confirm` link | Validation completes before protected UI mounts |
| Deleted elsewhere, retained JWT, cold start | Login; no restored user/role; local session and relevant caches cleared |
| Deleted elsewhere, retained JWT, protected deep link | No protected screen flash or data request; login |
| Deleted while app is backgrounded | Foreground check clears session and returns to login |
| Offline start with cached recipes and valid or refresh-due token | Public recipes remain usable; no destructive sign-out |
| Offline direct protected link / retryable auth error | Retry state; credentials retained; no protected screen |
| Network recovery, active profile | Retry resolves current role and opens requested protected screen |
| Network recovery, deleted profile | Cleanup and login |
| Successful in-app account deletion | Existing tour-key cleanup; session/store/query/SQLite cleared; reopening stays signed out |
| Genuine auth rejection | Local invalidation/login; never treat rejection as a network error |
| Schema not deployed / profile query fails | Protected UI stays blocked; credentials retained; retry after schema recovery |

Merge, deployment, release builds and this real-device matrix require separate
execution after the coordinated schema dependency is ready.
