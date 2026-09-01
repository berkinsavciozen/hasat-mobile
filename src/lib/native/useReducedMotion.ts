import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Mirrors the platform Reduce Motion preference for native transitions. */
export function useReducedMotion() {
  // AccessibilityInfo's initial read is asynchronous in RN 0.86. Start in
  // the motion-safe state so a visible modal cannot animate before that read
  // resolves. Once known, the native change event keeps the value current.
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => {
        // Failure stays conservative: no motion and no unhandled rejection.
        if (mounted) setReduceMotionEnabled(true);
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
