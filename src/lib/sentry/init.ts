import * as Sentry from "@sentry/react-native";
import { sanitizeBreadcrumb, sanitizeEvent } from "./sanitize";

// B-6 (Faz 1, minimum izleme) — yalnızca crash/error monitoring. Session
// Replay ve performans izleme (Tracing) bilinçli olarak kapsam dışı.
Sentry.init({
  dsn:
    process.env.EXPO_PUBLIC_SENTRY_DSN ??
    "https://a12e256c40145a0b03ca271d36cd7114@o4512061608558592.ingest.de.sentry.io/4512061632348240",
  tracesSampleRate: 0,
  // Bölüm 2 — Authorization/token sızıntısını engelleme (bkz. sanitize.ts).
  beforeBreadcrumb(breadcrumb) {
    return sanitizeBreadcrumb(breadcrumb);
  },
  beforeSend(event) {
    return sanitizeEvent(event);
  },
});
