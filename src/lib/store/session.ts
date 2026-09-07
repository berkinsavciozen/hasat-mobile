// Web'in `hasat-store` (zustand, localStorage) karşılığı — sadece giriş
// akışının ihtiyaç duyduğu alanlarla sınırlı (rol + temel profil). Tarif
// katmanının kullanacağı alanlar M5-b'de eklenecek.
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { LargeSecureStore } from "@/lib/supabase/large-secure-store";

const secureStore = new LargeSecureStore();

// Serialize encrypted writes so an earlier profile write cannot finish after clear().
let pendingStorage: Promise<void> = Promise.resolve();
function enqueueStorage(operation: () => Promise<void>): Promise<void> {
  pendingStorage = pendingStorage.catch(() => {}).then(operation);
  return pendingStorage;
}
export function flushSessionStorage(): Promise<void> {
  return pendingStorage;
}

const zustandSecureStorage: StateStorage = {
  getItem: async (name) => (await secureStore.getItem(name)) ?? null,
  setItem: (name, value) => enqueueStorage(() => secureStore.setItem(name, value)),
  removeItem: (name) => enqueueStorage(() => secureStore.removeItem(name)),
};

export type HasatRole = "farmer" | "buyer";

interface SessionUser {
  id: string;
  name?: string;
  phone?: string;
  city?: string;
  premium?: boolean;
}

interface SessionState {
  role: HasatRole;
  roleResolvedForUserId: string | null;
  user: SessionUser | null;
  setRole: (role: HasatRole, userId: string) => void;
  clearRoleResolution: () => void;
  updateUser: (user: Partial<SessionUser> & { id: string }) => void;
  clear: () => void;
}

export const useHasatMobileSession = create<SessionState>()(
  persist(
    (set) => ({
      role: "buyer",
      roleResolvedForUserId: null,
      user: null,
      setRole: (role, userId) => set({ role, roleResolvedForUserId: userId }),
      clearRoleResolution: () => set({ roleResolvedForUserId: null }),
      updateUser: (user) =>
        set((s) => ({ user: { ...s.user, ...user, id: user.id } })),
      clear: () =>
        set({ user: null, role: "buyer", roleResolvedForUserId: null }),
    }),
    {
      name: "hasat-mobile-session",
      storage: createJSONStorage(() => zustandSecureStorage),
      // A persisted role resolution is never authorization for a new process.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<SessionState>),
        roleResolvedForUserId: null,
      }),
    },
  ),
);
