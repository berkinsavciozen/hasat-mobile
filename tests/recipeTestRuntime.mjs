import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function installRuntime() {
  const root = new URL("../", import.meta.url);
  const mocks = {
    "react": "export const useEffect=()=>{}, useMemo=f=>f(), useRef=()=>({});",
    "@tanstack/react-query": "export const useQuery=options=>options;",
    "@/integrations/supabase/client": "export const supabase=globalThis.__recipeClient;",
    "@/lib/supabase/client": "export const supabase=globalThis.__recipeClient;",
    "@/lib/hasat/queries": "export const useAuthUserId=()=>null;",
    "@/lib/hasat/session": "export const getOrCreateSessionId=()=>null;",
    // T6 — `uuid.ts` yalnızca `react-native-get-random-values` (CJS, RN-özel)
    // üzerinden çalışıyor; bu Node testinde `session.ts`'in AsyncStorage'ı gibi
    // gerçek RN modülü yok. Testler idempotency_key'in Faz A/B arasında AYNI
    // kaldığını doğruluyor, gerçek rastgeleliği değil — deterministik sahte
    // UUID'ler yeterli.
    "@/lib/hasat/uuid":
      "let n=0; export function uuidv4(){ n+=1; return `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`; }",
    "@/lib/net/useIsOffline": "export const useIsOffline=()=>globalThis.__offline ?? false;",
    "expo-sqlite": "export const openDatabaseAsync=async()=>globalThis.__recipeDb;",
  };
  return registerHooks({
    resolve(specifier, context, next) {
      if (mocks[specifier]) return { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]), shortCircuit: true };
      if (specifier.startsWith("@/")) specifier = new URL("src/" + specifier.slice(2), root).href;
      if ((specifier.startsWith(".") || specifier.startsWith("file:")) && context.parentURL) {
        const url = new URL(specifier, context.parentURL);
        if (!existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + ".ts"))
          return next(pathToFileURL(fileURLToPath(url) + ".ts").href, context);
      }
      return next(specifier, context);
    },
  });
}
