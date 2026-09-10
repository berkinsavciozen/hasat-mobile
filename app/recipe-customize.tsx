// T6-mobil — "AI ile özelleştir".
// Şartname: dispatch [T7a+T6+F11-UI-mobil] (2026-09-10) → Bölüm 2.
//
// İKİ FAZ, TEK EKRAN (import.tsx'teki tek-rota-dört-aşama deseniyle aynı
// gerekçe — kullanıcı için ayrı ekran farkı yok, öneri/kaydetme rotalar
// arasında taşınmak zorunda kalmıyor):
//   "instruction" — kullanıcı ne değiştirmek istediğini yazar.
//   "loading"     — Faz A (`customize-recipe`, phase=propose) bekleniyor.
//   "review"      — dönen öneri DÜZENLENEBİLİR (kabul kriteri #1) — kaydetmeden
//                   önce başlık/malzeme/adım değiştirilebilir. Kaydet ("Faz B",
//                   `rpc_create_ai_customized_recipe`) başarılı olunca F7'nin
//                   düzenleme ekranına (`/import?recipeId=`) yönlendirilir —
//                   bu ekranın kendi ayrı bir "kaydedildi" hâli yok.
//
// idempotency_key ekran açılırken BİR KERE üretilir, Faz A ve Faz B'de AYNI
// değer kullanılır (kabul kriteri #2) — bkz. lib/hasat/customizeRecipe.ts.
import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";
import {
  proposeCustomization,
  saveCustomization,
  newIdempotencyKey,
  CustomizeRecipeError,
  type CustomizeDraft,
  type CustomizeDraftIngredient,
  type CustomizeDraftStep,
} from "@/lib/hasat/customizeRecipe";

type Stage = "instruction" | "loading" | "review";

let keySeq = 0;
function newKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

interface EditableIngredient {
  key: string;
  crop: string | null;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  isKey: boolean;
}
interface EditableStep {
  key: string;
  instruction: string;
  timerMinutes: string;
}
interface EditableDraft {
  title: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  restMinutes: string;
  difficulty: "kolay" | "orta" | "zor" | null;
  ingredients: EditableIngredient[];
  steps: EditableStep[];
}

function numToStr(n: number | null): string {
  return n == null ? "" : String(n);
}
function parseIntOrNull(v: string): number | null {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function parseNumOrNull(v: string): number | null {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toEditable(d: CustomizeDraft): EditableDraft {
  return {
    title: d.title,
    description: d.description ?? "",
    servings: numToStr(d.servings),
    prepMinutes: numToStr(d.prepMinutes),
    cookMinutes: numToStr(d.cookMinutes),
    restMinutes: numToStr(d.restMinutes),
    difficulty: d.difficulty,
    ingredients: d.ingredients.map((ing) => ({
      key: newKey("ing"),
      crop: ing.crop,
      name: ing.freeTextName ?? "",
      quantity: numToStr(ing.quantity),
      unit: ing.unit ?? "",
      note: ing.note ?? "",
      isKey: ing.isKeyIngredient,
    })),
    steps: d.steps.map((s) => ({
      key: newKey("step"),
      instruction: s.instruction,
      timerMinutes: s.timerSeconds == null ? "" : String(Math.round(s.timerSeconds / 60)),
    })),
  };
}

function toApiDraft(d: EditableDraft): CustomizeDraft {
  const ingredients: CustomizeDraftIngredient[] = d.ingredients
    .filter((ing) => ing.name.trim())
    .map((ing, i) => ({
      crop: ing.crop,
      freeTextName: ing.name.trim(),
      quantity: parseNumOrNull(ing.quantity),
      unit: ing.unit.trim() || null,
      note: ing.note.trim() || null,
      isKeyIngredient: ing.isKey,
      sortOrder: i,
    }));
  const steps: CustomizeDraftStep[] = d.steps
    .filter((s) => s.instruction.trim())
    .map((s, i) => {
      const minutes = parseIntOrNull(s.timerMinutes);
      return {
        stepNo: i + 1,
        instruction: s.instruction.trim(),
        timerSeconds: minutes == null ? null : minutes * 60,
      };
    });
  return {
    title: d.title.trim() || "Adsız tarif",
    description: d.description.trim() || null,
    servings: parseIntOrNull(d.servings),
    prepMinutes: parseIntOrNull(d.prepMinutes),
    cookMinutes: parseIntOrNull(d.cookMinutes),
    restMinutes: parseIntOrNull(d.restMinutes),
    difficulty: d.difficulty,
    ingredients,
    steps,
  };
}

export default function RecipeCustomizeScreen() {
  const insets = useSafeAreaInsets();
  const { recipeId, title: sourceTitle } = useLocalSearchParams<{
    recipeId: string;
    title?: string;
  }>();
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [stage, setStage] = useState<Stage>("instruction");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = instruction.trim().length >= 5 && !!recipeId;

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setError(null);
    setStage("loading");
    try {
      const result = await proposeCustomization({
        sourceRecipeId: recipeId,
        instruction: instruction.trim(),
        idempotencyKey,
      });
      setDraft(toEditable(result.draft));
      setIssues(
        result.valid
          ? []
          : result.issues
              .map((iss) => (iss && typeof iss === "object" ? (iss as any).message : null))
              .filter((m): m is string => typeof m === "string" && m.length > 0),
      );
      setStage("review");
    } catch (e) {
      setError(
        e instanceof CustomizeRecipeError ? e.message : "Öneri alınamadı. Tekrar dener misin?",
      );
      setStage("instruction");
    }
  }, [canSubmit, recipeId, instruction, idempotencyKey]);

  const confirmSave = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const newRecipeId = await saveCustomization({
        idempotencyKey,
        sourceRecipeId: recipeId,
        draft: toApiDraft(draft),
      });
      // F7'nin düzenleme girişiyle aynı yol (kural #106 — yeni ekran yok):
      // yeni özelleştirilmiş taslak da `app/import.tsx`'in review formunda açılır.
      router.replace({ pathname: "/import", params: { recipeId: newRecipeId } });
    } catch (e) {
      setError(e instanceof CustomizeRecipeError ? e.message : "Kaydedilemedi. Tekrar dener misin?");
      setSaving(false);
    }
  }, [draft, saving, idempotencyKey, recipeId]);

  if (!recipeId) {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top }}
      >
        <Text className="text-center text-sm text-hmuted">Tarif bulunamadı.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-xs text-saffron underline">← Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  if (stage === "loading") {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <ActivityIndicator color="#C8833B" size="large" />
        <Text className="mt-4 text-sm text-hwhite">Öneri hazırlanıyor…</Text>
      </View>
    );
  }

  if (stage === "review" && draft) {
    return (
      <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
        <View
          className="flex-row items-center justify-between border-b border-white/10 px-5 pb-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text className="text-xl text-hwhite">✕</Text>
          </Pressable>
          <Text className="text-base font-medium text-hwhite">Öneriyi Kontrol Et</Text>
          <Pressable disabled={saving} onPress={confirmSave}>
            <Text className="text-base font-medium text-saffron">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {issues.length > 0 && (
            <View className="mb-4 rounded-xl border border-gold/40 bg-gold/15 p-3">
              <Text className="mb-1 text-xs font-medium text-hwhite">
                ⚠️ Bu öneride birkaç şey gözden geçirilmeli:
              </Text>
              {issues.map((iss, i) => (
                <Text key={i} className="text-[11px] text-hmuted">
                  • {iss}
                </Text>
              ))}
            </View>
          )}

          <Field label="Başlık">
            <TextInput
              value={draft.title}
              onChangeText={(v) => setDraft({ ...draft, title: v })}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
              placeholderTextColor="rgba(253,250,245,0.3)"
            />
          </Field>

          <Field label="Açıklama">
            <TextInput
              value={draft.description}
              onChangeText={(v) => setDraft({ ...draft, description: v })}
              multiline
              className="min-h-[60px] rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-hwhite"
              placeholderTextColor="rgba(253,250,245,0.3)"
            />
          </Field>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Porsiyon">
                <TextInput
                  value={draft.servings}
                  onChangeText={(v) => setDraft({ ...draft, servings: v })}
                  keyboardType="number-pad"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Hazırlık (dk)">
                <TextInput
                  value={draft.prepMinutes}
                  onChangeText={(v) => setDraft({ ...draft, prepMinutes: v })}
                  keyboardType="number-pad"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Pişirme (dk)">
                <TextInput
                  value={draft.cookMinutes}
                  onChangeText={(v) => setDraft({ ...draft, cookMinutes: v })}
                  keyboardType="number-pad"
                  className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                />
              </Field>
            </View>
          </View>

          <SectionHeader
            title={`Malzemeler (${draft.ingredients.length})`}
            onAdd={() =>
              setDraft({
                ...draft,
                ingredients: [
                  ...draft.ingredients,
                  { key: newKey("ing"), crop: null, name: "", quantity: "", unit: "", note: "", isKey: false },
                ],
              })
            }
          />
          {draft.ingredients.map((ing, i) => (
            <View key={ing.key} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={ing.name}
                  onChangeText={(v) => {
                    const next = [...draft.ingredients];
                    next[i] = { ...ing, name: v };
                    setDraft({ ...draft, ingredients: next });
                  }}
                  placeholder="malzeme"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="flex-1 text-sm text-hwhite"
                />
                <Pressable
                  onPress={() =>
                    setDraft({
                      ...draft,
                      ingredients: draft.ingredients.filter((x) => x.key !== ing.key),
                    })
                  }
                  hitSlop={10}
                >
                  <Text className="text-xs text-hmuted">Sil</Text>
                </Pressable>
              </View>
              <View className="mt-2 flex-row gap-2">
                <TextInput
                  value={ing.quantity}
                  onChangeText={(v) => {
                    const next = [...draft.ingredients];
                    next[i] = { ...ing, quantity: v };
                    setDraft({ ...draft, ingredients: next });
                  }}
                  placeholder="miktar"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  keyboardType="decimal-pad"
                  className="w-24 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-hwhite"
                />
                <TextInput
                  value={ing.unit}
                  onChangeText={(v) => {
                    const next = [...draft.ingredients];
                    next[i] = { ...ing, unit: v };
                    setDraft({ ...draft, ingredients: next });
                  }}
                  placeholder="birim"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-hwhite"
                />
              </View>
            </View>
          ))}

          <SectionHeader
            title={`Adımlar (${draft.steps.length})`}
            onAdd={() =>
              setDraft({
                ...draft,
                steps: [...draft.steps, { key: newKey("step"), instruction: "", timerMinutes: "" }],
              })
            }
          />
          {draft.steps.map((s, i) => (
            <View key={s.key} className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <View className="flex-row items-start gap-2">
                <Text className="pt-1 font-mono text-xs text-hmuted">{i + 1}.</Text>
                <TextInput
                  value={s.instruction}
                  onChangeText={(v) => {
                    const next = [...draft.steps];
                    next[i] = { ...s, instruction: v };
                    setDraft({ ...draft, steps: next });
                  }}
                  multiline
                  placeholder="adım açıklaması"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="flex-1 text-sm text-hwhite"
                />
                <Pressable
                  onPress={() =>
                    setDraft({ ...draft, steps: draft.steps.filter((x) => x.key !== s.key) })
                  }
                  hitSlop={10}
                >
                  <Text className="text-xs text-hmuted">Sil</Text>
                </Pressable>
              </View>
              <View className="mt-2 flex-row items-center gap-2">
                <Text className="text-[11px] text-hmuted">⏱ süre (dk):</Text>
                <TextInput
                  value={s.timerMinutes}
                  onChangeText={(v) => {
                    const next = [...draft.steps];
                    next[i] = { ...s, timerMinutes: v };
                    setDraft({ ...draft, steps: next });
                  }}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="w-16 rounded-lg border border-white/10 px-2 py-1 text-xs text-hwhite"
                />
              </View>
            </View>
          ))}

          {error && <Text className="mt-4 text-xs text-hred">{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingScreen>
    );
  }

  // ── Talimat girişi ─────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
      <View
        className="flex-row items-center gap-3 px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-xl text-hwhite">✕</Text>
        </Pressable>
        <Text className="text-lg font-medium text-hwhite">AI ile Özelleştir</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <Text className="mb-1 text-sm text-hwhite">
          {sourceTitle
            ? `“${sourceTitle}” tarifinde ne değiştirmek istersin?`
            : "Ne değiştirmek istersin?"}
        </Text>
        <Text className="mb-5 text-xs text-hmuted">
          Ör. “Etsiz yap”, “Fırında değil tavada pişecek şekilde uyarla”, “Baharatları azalt”. AI
          önerisini kaydetmeden önce düzenleyebilirsin — yalnızca sana görünen ayrı bir taslak
          olarak kaydedilir, bu tarifin herkese açık hâli değişmez.
        </Text>

        <TextInput
          value={instruction}
          onChangeText={setInstruction}
          multiline
          textAlignVertical="top"
          placeholder="Ne değiştirmek istediğini yaz…"
          placeholderTextColor="rgba(253,250,245,0.3)"
          className="min-h-[140px] rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-hwhite"
        />
        <Pressable
          disabled={!canSubmit}
          onPress={() => void submit()}
          className="mt-4 items-center rounded-xl bg-saffron py-3.5"
          style={{ opacity: canSubmit ? 1 : 0.4 }}
        >
          <Text className="font-medium text-hwhite">Öneri İste</Text>
        </Pressable>

        {error && <Text className="mt-4 text-xs text-hred">{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-[11px] uppercase tracking-wider text-hmuted">{label}</Text>
      {children}
    </View>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <View className="mb-2 mt-5 flex-row items-center justify-between">
      <Text className="text-xs font-medium uppercase tracking-wider text-hmuted">{title}</Text>
      <Pressable onPress={onAdd} hitSlop={10} className="rounded-full border border-white/20 px-3 py-1">
        <Text className="text-xs text-hwhite">+ Ekle</Text>
      </Pressable>
    </View>
  );
}
