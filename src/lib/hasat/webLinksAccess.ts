// T9 — pure decision logic for openWebWithSession(), split out of webLinks.ts so it's testable with
// plain `node --experimental-strip-types --test` (no react-native / expo-secure-store in the import
// graph — mirrors how other route-guard logic in this codebase separates pure decisions from their
// platform-specific host).
//
// Context: openWebWithSession() used to put the mobile session's real access_token + refresh_token
// directly in the URL fragment handed to Linking.openURL(). The refresh_token is long-lived, so a
// leak there is a persistent session-takeover risk, not just a momentary one — most mobile browsers
// write the full URL (fragment included) into browser history before the target page's own script
// runs to clear it, and Linking.openURL() is an OS-level call whose target can be intercepted by
// anything else registered to handle that URL. T9 replaces the tokens in the URL with a random,
// single-use, short-lived (60s) opaque nonce: the real tokens now travel only over an HTTPS POST body
// to the `mobile-handoff-issue` / `mobile-handoff-exchange` edge functions (hasat-d2c-marketplace).
export type HandoffSession = { access_token: string; refresh_token: string };

export type ResolveWebSessionUrlDeps = {
  /** Wraps supabase.auth.refreshSession() — resolves to a null session on no active/refreshable session. */
  refreshSession: () => Promise<{ session: HandoffSession | null }>;
  /** Wraps the mobile-handoff-issue edge function call. Returns null on any failure (never throws). */
  issueHandoffNonce: (refreshToken: string, path: string) => Promise<{ nonce: string } | null>;
};

/**
 * Decides what URL openWebWithSession() should open for `path`. Never throws: any failure at any step
 * (no session, nonce-issue failure) falls back to the plain, session-less URL — exactly the same
 * fallback the pre-T9 direct-token flow used when refreshSession() failed, so opening a stale/expired
 * mobile session still degrades to "same behavior as an already-logged-out user", not a crash.
 */
export async function resolveWebSessionUrl(
  webAppUrl: string,
  path: string,
  deps: ResolveWebSessionUrlDeps,
): Promise<string> {
  const { session } = await deps.refreshSession();
  if (session?.access_token && session?.refresh_token) {
    const issued = await deps.issueHandoffNonce(session.refresh_token, path).catch(() => null);
    if (issued?.nonce) {
      const nonce = encodeURIComponent(issued.nonce);
      const next = encodeURIComponent(path);
      return `${webAppUrl}/auth/mobile-handoff#nonce=${nonce}&next=${next}`;
    }
  }
  return `${webAppUrl}${path}`;
}
