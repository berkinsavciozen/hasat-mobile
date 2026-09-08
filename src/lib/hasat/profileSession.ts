/** A stored JWT is not proof that its profile is still active. */
export interface SessionProfile {
  id: string;
  role: string;
  deleted_at: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  premium: boolean;
}

export type ProfileSessionResult =
  | { status: "active"; profile: SessionProfile }
  | { status: "guest" | "invalid" | "unavailable" };

type Failure = { name?: string; message?: string; status?: number; code?: string };

export function isRetryableAuthError(error: Failure): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  // An explicit auth rejection takes precedence over network wording.
  if (error.status === 401 || error.status === 403) return false;
  return /network|fetch/i.test(error.message ?? "") || (error.status ?? 0) >= 500;
}

export async function inspectProfileSession(deps: {
  getSession(): Promise<{ userId: string | null; error: Failure | null }>;
  getProfile(userId: string): Promise<{ data: SessionProfile | null; error: Failure | null }>;
}): Promise<ProfileSessionResult> {
  try {
    const session = await deps.getSession();
    if (session.error) {
      if (isRetryableAuthError(session.error)) return { status: "unavailable" };
      if (session.error.status === 401 || session.error.status === 403 ||
          session.error.name === "AuthSessionMissingError" ||
          session.error.code === "refresh_token_not_found" ||
          session.error.code === "refresh_token_already_used") return { status: "invalid" };
      return { status: "unavailable" };
    }
    if (!session.userId) return { status: "guest" };
    const { data, error } = await deps.getProfile(session.userId);
    // A query failure (including a not-yet-deployed column) is not deletion evidence.
    if (error) return { status: "unavailable" };
    if (!data || data.deleted_at != null) return { status: "invalid" };
    if (data.deleted_at !== null || data.id !== session.userId) return { status: "unavailable" };
    return { status: "active", profile: data };
  } catch {
    return { status: "unavailable" };
  }
}

export function isPublicSessionPath(path: string): boolean {
  return path === "/" || path === "/login" || path === "/home" ||
    path.startsWith("/recipe/") || path.startsWith("/cook/") || path.startsWith("/product/");
}
