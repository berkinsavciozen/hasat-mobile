import { Redirect } from "expo-router";
import { useHasatMobileSession } from "@/lib/store/session";

// SessionBoundary has already checked deleted_at, including on cold start.
// Offline public recipes remain reachable without treating a cached role as verified.
export default function Index() {
  const user = useHasatMobileSession((s) => s.user);
  const resolved = useHasatMobileSession((s) => s.roleResolvedForUserId);
  if (!user) return <Redirect href="/login" />;
  return <Redirect href={resolved === user.id && !user.name?.trim() ? "/onboarding" : "/home"} />;
}
