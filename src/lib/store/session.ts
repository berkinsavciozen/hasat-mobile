// Web'in `hasat-store` (zustand, localStorage) karşılığı — sadece giriş
// akışının ihtiyaç duyduğu alanlarla sınırlı (rol + temel profil). Tarif
// katmanının kullanacağı alanlar M5-b'de eklenecek.
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { LargeSecureStore } from "@/lib/supabase/large-secure-store";

const secureStore = new LargeSecureStore();

const zustandSecureStorage: StateStorage = {
  getItem: async (name) => (await secureStore.getItem(name)) ?? null,
  setItem: async (name, value) => secureStore.setItem(name, value),
  removeItem: async (name) => secureStore.removeItem(name),
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
  user: SessionUser | null;
  setRole: (role: HasatRole) => void;
  updateUser: (user: Partial<SessionUser> & { id: string }) => void;
  clear: () => void;
}

export const useHasatMobileSession = create<SessionState>()(
  persist(
    (set) => ({
      role: "buyer",
      user: null,
      setRole: (role) => set({ role }),
      updateUser: (user) =>
        set((s) => ({ user: { ...s.user, ...user, id: user.id } })),
      clear: () => set({ user: null, role: "buyer" }),
    }),
    {
      name: "hasat-mobile-session",
      storage: createJSONStorage(() => zustandSecureStorage),
    },
  ),
);
