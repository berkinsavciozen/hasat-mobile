// T1 Faz 2b — Apple's Universal Links matching happens entirely at the OS
// level against hasat-d2c-marketplace's AASA `paths` (now claiming
// `/tarifler/*`, the real web recipe path — see that repo's
// [.well-known]/apple-app-site-association.ts). Once iOS hands the app a
// `/tarifler/{slug}` URL, expo-router still needs a route for it, and
// there is none — the actual screen lives at `recipe/[slug].tsx`.
// Renaming that file was avoided (risk of breaking other references to
// the recipe screen); this redirect is expo-router's own documented
// mechanism for exactly this case.
//
// `path` is the raw incoming href (e.g. `https://hasat-ai.com/tarifler/x`,
// or a bare `/tarifler/x` in dev/Expo Go), not a pre-parsed pathname — see
// expo-router's getLinkingConfig.js — so match `/tarifler/<slug>` as a
// substring rather than assuming any particular scheme/host shape.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  const match = path.match(/\/tarifler\/([^/?#]+)/);
  if (!match) return path;
  return path.replace(match[0], `/recipe/${match[1]}`);
}
