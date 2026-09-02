export const INTRO_TOUR_STORAGE_KEY_PREFIX = "hasat_mobile_intro_done";

export type IntroTourStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function introTourStorageKey(userId: string): string {
  return `${INTRO_TOUR_STORAGE_KEY_PREFIX}:${userId}`;
}

export async function hasSeenIntroTourInStorage(
  userId: string,
  storage: IntroTourStorage,
): Promise<boolean> {
  return (await storage.getItem(introTourStorageKey(userId))) === "1";
}

export async function markIntroTourSeenInStorage(
  userId: string,
  storage: IntroTourStorage,
): Promise<void> {
  await storage.setItem(introTourStorageKey(userId), "1");
}

export async function removeIntroTourSeenFromStorage(
  userId: string,
  storage: IntroTourStorage,
): Promise<void> {
  await storage.removeItem(introTourStorageKey(userId));
}
