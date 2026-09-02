export type IntroTourDecision = {
  userId: string | null;
  visible: boolean;
};

export type IntroTourIdentity = {
  userId: string | null;
  role: "buyer" | "farmer" | null;
};

/**
 * Serializes auth-driven storage reads. A later auth state always invalidates
 * an earlier pending read, so user A can never update user B's modal state.
 */
export function createIntroTourEvaluator(
  readSeen: (userId: string) => Promise<boolean>,
  onDecision: (decision: IntroTourDecision) => void,
) {
  let revision = 0;
  let disposed = false;

  return {
    async evaluate({ userId, role }: IntroTourIdentity): Promise<void> {
      const requestRevision = ++revision;

      if (!userId || role !== "buyer") {
        if (!disposed) onDecision({ userId: null, visible: false });
        return;
      }

      const seen = await readSeen(userId);
      if (disposed || requestRevision !== revision) return;
      onDecision({ userId, visible: !seen });
    },
    dispose(): void {
      disposed = true;
      revision += 1;
    },
  };
}
