import { mapRecipeFacts } from "../hasat/recipeFacts";
import type { RecipeFacts } from "../hasat/recipeFacts";

export function serializeRecipeFacts(facts: RecipeFacts): string {
  return JSON.stringify({ version: 1, facts: mapRecipeFacts(facts) });
}

/** Unknown versions and damaged/legacy records fail closed to unavailable/unreviewed. */
export function deserializeRecipeFacts(value: string | null | undefined): RecipeFacts {
  if (!value) return mapRecipeFacts({});
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version !== 1 || !parsed.facts || typeof parsed.facts !== "object"
      || Array.isArray(parsed.facts)) return mapRecipeFacts({});
    return mapRecipeFacts(parsed.facts);
  } catch {
    return mapRecipeFacts({});
  }
}
