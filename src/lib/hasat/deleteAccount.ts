export type DeleteAccountOperations = {
  getUserId(): Promise<string | null>;
  deleteAccount(): Promise<void>;
  removeIntroTourSeen(userId: string): Promise<void>;
};

/** Keeps best-effort local tour cleanup outside the critical RPC path. */
export async function deleteAccountWithIntroCleanup({
  getUserId,
  deleteAccount,
  removeIntroTourSeen,
}: DeleteAccountOperations): Promise<void> {
  let userId: string | null = null;
  try {
    userId = await getUserId();
  } catch {
    // Session lookup is cleanup context only; deletion must still proceed.
  }

  await deleteAccount();

  if (userId) {
    try {
      await removeIntroTourSeen(userId);
    } catch {
      // Successful account deletion must not become a local-cleanup failure.
    }
  }
}
