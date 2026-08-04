// P23-M6 — AI tarif içe aktarma akışı.
// Şartname: Build/P23-Mobile-Visual-Spec.md → "3. AI Import Akışı" (3a kaynak
// seçimi, 3b bekleme, 3c Düzelt/Onayla — kritik ekran, 3d kaydedildi).
//
// Şartnamedeki dört ekran burada TEK ROTA içinde dört AŞAMA olarak duruyor:
// çıkarım sonucu (taslak kimliği + düzenlenen alanlar) rotalar arasında
// taşınmak zorunda kalmasın diye. Kullanıcı açısından fark yok — her aşama
// tam ekran.
//
// KAPSAM DIŞI (bilinçli, M9 — hukuki kontrol şartlı): YouTube/link importu ve
// bitmiş yemek fotoğrafından tahmin. Bu ekranda böyle bir giriş YOK; edge
// function da `mode` olarak yalnızca 'text'/'photo' kabul ediyor.
import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import {
  extractRecipe,
  loadDraft,
  saveDraft,
  discardDraft,
  newKey,
  ImportError,
  LOW_CONFIDENCE_THRESHOLD,
  type RecipeDraft,
  type IngredientClass,
} from "@/lib/hasat/import";
import { MY_RECIPES_QUERY_KEY } from "@/lib/hasat/myRecipes";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { CropPickerModal } from "@/components/hasat/CropPickerModal";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Stage = "pick" | "text" | "loading" | "review" | "saved";

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Stage>("pick");
  const [text, setText] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cropPickerForKey, setCropPickerForKey] = useState<string | null>(null);

  const run = useCallback(
    async (input: { mode: "text" | "photo"; text?: string; base64?: string; mime?: string }) => {
      setError(null);
      setStage("loading");
      try {
        const result = await extractRecipe({
          mode: input.mode,
          text: input.text,
          imageBase64: input.base64,
          imageMime: input.mime,
          recipeName: recipeName.trim() || undefined,
        });
        const loaded = await loadDraft(result.recipeId);
        setDraft(loaded);
        setStage("review");
      } catch (e) {
        setError(e instanceof ImportError ? e.message : "Tarif okunamadı. Tekrar dener misin?");
        setStage(input.mode === "text" ? "text" : "pick");
      }
    },
    [recipeName],
  );

  const pickImage = useCallback(
    async (source: "camera" | "library") => {
      setError(null);
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          source === "camera"
            ? "Kamera izni verilmedi. Tarif sayfasının fotoğrafını çekebilmek için izin gerekiyor — galeriden seçmeyi ya da metin yapıştırmayı da deneyebilirsin."
            : "Galeri izni verilmedi. Fotoğraf çekmeyi ya da metin yapıştırmayı deneyebilirsin.",
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.5,
        allowsEditing: true,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError("Fotoğraf okunamadı, tekrar dener misin?");
        return;
      }
      if ((asset.base64.length * 3) / 4 > MAX_IMAGE_BYTES) {
        setError("Fotoğraf çok büyük. Daha yakından, tek sayfayı içeren bir kare çek.");
        return;
      }
      setPreviewUri(asset.uri);
      await run({
        mode: "photo",
        base64: asset.base64,
        mime: asset.mimeType ?? "image/jpeg",
      });
    },
    [run],
  );

  const close = useCallback(async () => {
    // Taslak kaydedilmeden çıkılıyorsa silinir — yarım/bozuk bir kayıt
    // defterde birikmemeli.
    if (stage === "review" && draft) {
      try {
        await discardDraft(draft.recipeId);
      } catch (e) {
        console.warn("[import] taslak silinemedi", e);
      }
    }
    router.back();
  }, [stage, draft]);

  // ── 3d — Kaydedildi ───────────────────────────────────────────────────────
  if (stage === "saved") {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text style={{ fontSize: 44 }}>✅</Text>
        <Text className="mt-3 text-lg font-medium text-hwhite">Defterine kaydedildi</Text>
        <Text className="mt-2 text-center text-sm text-hmuted">
          Bu tarif yalnızca sana görünür. Hasat'ın herkese açık tarifleriyle karışmaz.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-xl bg-saffron px-6 py-3"
        >
          <Text className="font-medium text-hwhite">Defterime dön</Text>
        </Pressable>
      </View>
    );
  }

  // ── 3b — Çıkarım bekleme ──────────────────────────────────────────────────
  if (stage === "loading") {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {previewUri && (
          <Image
            source={{ uri: previewUri }}
            className="mb-6 h-40 w-32 rounded-xl"
            resizeMode="cover"
          />
        )}
        {/* Belirsiz spinner — sabit ilerleme çubuğu bilinçli olarak YOK
            (şartname 3b: yanlış süre beklentisi vermemek için). */}
        <ActivityIndicator color="#C8833B" size="large" />
        <Text className="mt-4 text-sm text-hwhite">Tarif okunuyor…</Text>
        <Text className="mt-1 text-center text-xs text-hmuted">
          Fotoğraflarda biraz daha uzun sürebilir.
        </Text>
      </View>
    );
  }

  // ── 3c — Düzelt/Onayla ────────────────────────────────────────────────────
  if (stage === "review" && draft) {
    const lowConfidence =
      draft.extractionConfidence != null && draft.extractionConfidence < LOW_CONFIDENCE_THRESHOLD;
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-dark"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          className="flex-row items-center justify-between border-b border-white/10 px-5 pb-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable onPress={close} hitSlop={12}>
            <Text className="text-xl text-hwhite">✕</Text>
          </Pressable>
          <Text className="text-base font-medium text-hwhite">Kontrol Et</Text>
          <Pressable
            disabled={saving}
            onPress={async () => {
              setSaving(true);
              setError(null);
              try {
                await saveDraft(draft);
                await queryClient.invalidateQueries({ queryKey: MY_RECIPES_QUERY_KEY });
                setStage("saved");
              } catch (e) {
                setError("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <Text className="text-base font-medium text-saffron">
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {lowConfidence && (
            <View className="mb-4 rounded-xl border border-gold/40 bg-gold/15 p-3">
              <Text className="text-xs text-hwhite">
                ⚠️ Bu tarifi okurken pek emin olamadık. Alanları bir kez gözden geçir —
                hepsini düzeltebilirsin.
              </Text>
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

          {/* Malzemeler — P23-M6-ek: `recipe_ingredients.crop` artık daima NULL
              değil (deterministik alias trigger'ı bağlıyorsa dolu gelir).
              Otomatik eşleşen crop burada önseçili gösterilir; kullanıcı
              değiştirebilir veya kaldırabilir (CropPickerModal). Alias'ı
              boş olan 56 crop için eşleşme burada tamamlanabilir — bu da
              M9'un alias doldurma işine kullanım verisi üretir. */}
          <SectionHeader
            title={`Malzemeler (${draft.ingredients.length})`}
            onAdd={() =>
              setDraft({
                ...draft,
                ingredients: [
                  ...draft.ingredients,
                  {
                    id: null,
                    key: newKey("ing"),
                    name: "",
                    quantity: "",
                    unit: "",
                    note: null,
                    isKey: false,
                    crop: null,
                    ingredientClass: null,
                  },
                ],
              })
            }
          />
          {draft.ingredients.map((ing, i) => (
            <View
              key={ing.key}
              className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3"
            >
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
                  placeholder="birim (adet, g, kaşık…)"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-hwhite"
                />
              </View>
              <View className="mt-2 flex-row flex-wrap items-center gap-2">
                <Pressable
                  onPress={() => setCropPickerForKey(ing.key)}
                  className="rounded-full border px-2.5 py-1"
                  style={{
                    borderColor: ing.crop ? "#C8833B" : "rgba(255,255,255,0.15)",
                    backgroundColor: ing.crop ? "rgba(200,131,59,0.15)" : "transparent",
                  }}
                >
                  <Text className="text-[11px]" style={{ color: ing.crop ? "#C8833B" : "rgba(253,250,245,0.5)" }}>
                    {ing.crop ? `🌾 ${ing.crop}` : "Ürün eşleştir"}
                  </Text>
                </Pressable>
                <ClassToggle
                  value={ing.ingredientClass}
                  onChange={(v) => {
                    const next = [...draft.ingredients];
                    next[i] = { ...ing, ingredientClass: v };
                    setDraft({ ...draft, ingredients: next });
                  }}
                />
              </View>
            </View>
          ))}

          {cropPickerForKey &&
            (() => {
              const target = draft.ingredients.find((x) => x.key === cropPickerForKey);
              if (!target) return null;
              return (
                <CropPickerModal
                  visible
                  currentCrop={target.crop}
                  ingredientName={target.name}
                  onClose={() => setCropPickerForKey(null)}
                  onSelect={(crop) => {
                    const next = draft.ingredients.map((x) =>
                      x.key === cropPickerForKey ? { ...x, crop } : x,
                    );
                    setDraft({ ...draft, ingredients: next });
                    setCropPickerForKey(null);
                  }}
                />
              );
            })()}

          <SectionHeader
            title={`Adımlar (${draft.steps.length})`}
            onAdd={() =>
              setDraft({
                ...draft,
                steps: [...draft.steps, { key: newKey("step"), instruction: "", timerMinutes: "" }],
              })
            }
          />
          {draft.steps.length === 0 && (
            <View className="mb-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <Text className="text-xs text-hmuted">
                Adımlar okunamadı, elle ekleyebilirsin. Kaynakta yazmayan bir adımı uydurmadık —
                aşağıdaki "+ Ekle" ile kendi adımlarını yazabilirsin.
              </Text>
            </View>
          )}
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
                <Text className="flex-1 text-[10px] text-hmuted">
                  Girersen pişirme modunda geri sayım olur.
                </Text>
              </View>
            </View>
          ))}

          {error && <Text className="mt-4 text-xs text-hred">{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── 3a — Kaynak seçimi / metin girişi ─────────────────────────────────────
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-dark"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        className="flex-row items-center gap-3 px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable onPress={() => (stage === "text" ? setStage("pick") : router.back())} hitSlop={12}>
          <Text className="text-xl text-hwhite">✕</Text>
        </Pressable>
        <Text className="text-lg font-medium text-hwhite">Tarif Ekle</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {isOffline && (
          <View className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
            <Text className="text-xs text-hmuted">
              Çevrimdışısın — tarif çıkarma için internet bağlantısı gerekiyor.
            </Text>
          </View>
        )}

        {stage === "pick" ? (
          <>
            <Text className="mb-1 text-sm text-hwhite">
              Elindeki tarifi Hasat defterine aktar.
            </Text>
            <Text className="mb-5 text-xs text-hmuted">
              Yazılı bir tarifin fotoğrafını (kitap sayfası, el yazısı not) çekebilir ya da
              metnini yapıştırabilirsin. Fotoğraf yalnızca tarifi okumak için gönderilir;
              kamera izni bunun için isteniyor. Eklediğin tarif{" "}
              <Text className="text-hwhite">yalnızca sana görünür</Text>.
            </Text>

            <Field label="Tarifin adı (opsiyonel)">
              <TextInput
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder="Ör. Karnıyarık"
                placeholderTextColor="rgba(253,250,245,0.3)"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
              />
            </Field>
            <Text className="mb-5 text-[11px] text-hmuted">
              Bu ad yalnızca fotoğrafı/metni doğru okumamıza yardımcı olur — eksik kalan adım
              veya malzemeyi bu isimden tamamlamayız.
            </Text>

            <BigButton
              disabled={isOffline}
              label="📷 Fotoğraf Çek"
              onPress={() => void pickImage("camera")}
            />
            <BigButton
              disabled={isOffline}
              label="🖼 Galeriden Seç"
              onPress={() => void pickImage("library")}
            />
            <BigButton
              disabled={isOffline}
              label="✍️ Metin Yapıştır"
              onPress={() => setStage("text")}
            />

            <Text className="mt-6 text-[11px] text-hmuted">
              Bağlantı/YouTube ile içe aktarma ve bitmiş yemek fotoğrafından tahmin henüz yok.
            </Text>
          </>
        ) : (
          <>
            <Text className="mb-2 text-xs text-hmuted">Tarif metnini yapıştır</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              placeholder={"Örn:\nMercimek çorbası\n\nMalzemeler\n- 1 su bardağı kırmızı mercimek\n…\n\nYapılışı\n1. …"}
              placeholderTextColor="rgba(253,250,245,0.3)"
              className="min-h-[220px] rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-hwhite"
            />
            <Pressable
              disabled={text.trim().length < 20 || isOffline}
              onPress={() => void run({ mode: "text", text: text.trim() })}
              className="mt-4 items-center rounded-xl bg-saffron py-3.5"
              style={{ opacity: text.trim().length < 20 || isOffline ? 0.4 : 1 }}
            >
              <Text className="font-medium text-hwhite">Tarifi Çıkar</Text>
            </Pressable>
          </>
        )}

        {error && <Text className="mt-4 text-xs text-hred">{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
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

/** P23-M6-ek: "tarımsal ürün / market malzemesi" sınıflandırması, extract-recipe'in
 * tahmininden önseçili gelir, kullanıcı düzeltebilir. Sonradan "Talep Et" bu
 * sınıfı `crop_requests.ingredient_class`'a taşır (bkz. Build/DB-Schema.md). */
function ClassToggle({
  value,
  onChange,
}: {
  value: IngredientClass | null;
  onChange: (v: IngredientClass) => void;
}) {
  return (
    <View className="flex-row overflow-hidden rounded-full border border-white/15">
      <Pressable
        onPress={() => onChange("tarimsal")}
        className="px-2.5 py-1"
        style={{ backgroundColor: value === "tarimsal" ? "rgba(200,131,59,0.25)" : "transparent" }}
      >
        <Text
          className="text-[11px]"
          style={{ color: value === "tarimsal" ? "#C8833B" : "rgba(253,250,245,0.5)" }}
        >
          Tarımsal
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onChange("platform_disi")}
        className="px-2.5 py-1"
        style={{ backgroundColor: value === "platform_disi" ? "rgba(255,255,255,0.15)" : "transparent" }}
      >
        <Text
          className="text-[11px]"
          style={{ color: value === "platform_disi" ? "#FDFAF5" : "rgba(253,250,245,0.5)" }}
        >
          Market malzemesi
        </Text>
      </Pressable>
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

function BigButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="mb-3 items-center rounded-2xl border border-white/15 bg-white/5 py-5"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-base text-hwhite">{label}</Text>
    </Pressable>
  );
}
