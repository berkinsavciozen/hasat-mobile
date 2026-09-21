// P23-M6 — AI tarif içe aktarma akışı.
// Şartname: Build/P23-Mobile-Visual-Spec.md → "3. AI Import Akışı" (3a kaynak
// seçimi, 3b bekleme, 3c Düzelt/Onayla — kritik ekran, 3d kaydedildi).
//
// Şartnamedeki dört ekran burada TEK ROTA içinde dört AŞAMA olarak duruyor:
// çıkarım sonucu (taslak kimliği + düzenlenen alanlar) rotalar arasında
// taşınmak zorunda kalmasın diye. Kullanıcı açısından fark yok — her aşama
// tam ekran.
//
// T7a (2026-09-10, Berkin'in onayı — kural #107 sorusu, "Devam et, hukuki
// risk kabul" cevabı): "bitmiş yemek fotoğrafından tahmin" artık BURADA da
// bir giriş noktası — `pickImage(source, "estimate")` → `runEstimate` →
// `estimate-recipe-from-photo` (bkz. lib/hasat/photoEstimate.ts). Aynı review
// formu (bu dosyanın kalbi) yeniden kullanılıyor; tek fark, tahmin akışının
// döndürdüğü `disclaimer` + `uncertain_notes`'un review aşamasında BELİRGİN
// gösterilmesi (`estimateMeta` state'i, aşağıda). YouTube/link importu hâlâ
// KAPSAM DIŞI (M9, ayrı bir hukuki kontrol maddesi) — edge function'lar
// `mode`/görsel dışında bir kaynak kabul etmiyor.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
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
import { estimateRecipeFromPhoto, PhotoEstimateError } from "@/lib/hasat/photoEstimate";
import { MY_RECIPES_QUERY_KEY } from "@/lib/hasat/myRecipes";
import { useIsOffline } from "@/lib/net/useIsOffline";
import { CropPickerModal } from "@/components/hasat/CropPickerModal";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";
import {
  createManualPrivateRecipe,
  createRetryOperationKeyStore,
  PrivateRecipeMutationError,
} from "@/lib/hasat/privateRecipeMutations";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

type Stage = "pick" | "text" | "image-intent" | "loading" | "review" | "saved";

type PendingImage = { base64: string; mime: string; uri: string };

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isOffline = useIsOffline();
  const queryClient = useQueryClient();

  // F7 — Defterim'de kayıtlı bir tarifi düzenleme. `recipeId` route param'ı
  // varsa bu ekran yeni bir AI import akışı değil, var olan bir `recipes`
  // satırının düzenleyicisi olarak açılıyor: aynı "Kontrol Et" (review)
  // formu yeniden kullanılıyor (kural #106 — yeni ekran yok), yalnızca giriş
  // noktası ve çıkış davranışı farklılaşıyor. `loadDraft`/`saveDraft` zaten
  // taslak durumuna bakmadan `recipeId` üzerinden çalışıyor (bkz.
  // lib/hasat/import.ts) — bu yüzden ikisine de dokunulmadı.
  const { recipeId: editRecipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const isEditMode = !!editRecipeId;

  const [stage, setStage] = useState<Stage>(isEditMode ? "loading" : "pick");
  const [text, setText] = useState("");
  const [recipeName, setRecipeName] = useState("");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Tarif okunuyor…");
  const [cropPickerForKey, setCropPickerForKey] = useState<string | null>(null);
  const createOperationKeys = useRef(createRetryOperationKeyStore());
  const updateOperationKeys = useRef(createRetryOperationKeyStore());
  const manualCreateOperationKeys = useRef(createRetryOperationKeyStore());
  // T7a — yalnızca fotoğraftan-tahmin akışında dolu; review'da disclaimer'ı
  // BELİRGİN göstermek için (kabul kriteri #1/#2). Normal AI import'ta null.
  const [estimateMeta, setEstimateMeta] = useState<{
    disclaimer: string;
    uncertainNotes: string[];
  } | null>(null);

  useEffect(() => {
    if (!isEditMode || !editRecipeId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadDraft(editRecipeId);
        if (cancelled) return;
        setDraft(loaded);
        setStage("review");
      } catch (e) {
        console.error("[import] düzenlenecek tarif yüklenemedi", e);
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, editRecipeId]);

  const run = useCallback(
    async (input: { mode: "text" | "photo"; text?: string; base64?: string; mime?: string }) => {
      setError(null);
      setEstimateMeta(null);
      setLoadingLabel("Tarif okunuyor…");
      setStage("loading");
      const operationIdentity = JSON.stringify({
        kind: "extract",
        ...input,
        recipeName: recipeName.trim(),
      });
      const operationKey = createOperationKeys.current.acquire(operationIdentity);
      try {
        const result = await extractRecipe({
          mode: input.mode,
          operationKey,
          text: input.text,
          imageBase64: input.base64,
          imageMime: input.mime,
          recipeName: recipeName.trim() || undefined,
        });
        const loaded = await loadDraft(result.recipeId);
        createOperationKeys.current.succeed(operationIdentity, operationKey);
        setDraft(loaded);
        setPendingImage(null);
        setPreviewUri(null);
        setStage("review");
      } catch (e) {
        setError(e instanceof ImportError ? e.message : "Tarif okunamadı. Tekrar dener misin?");
        // Seçilmiş fotoğrafı bellekte tut: kullanıcı aynı görseli yeniden
        // seçmeden ve aynı operation key ile tekrar deneyebilsin.
        setStage(input.mode === "text" ? "text" : "image-intent");
      }
    },
    [recipeName],
  );

  // T7a — bitmiş/pişmiş yemek fotoğrafından TAHMİN. `run()`dan ayrı: farklı
  // edge function, farklı sonuç şekli (`disclaimer`/`uncertain_notes`, DB'ye
  // yazılmıyor — yalnızca review'da gösterilecek, geçici ekran state'i).
  const runEstimate = useCallback(
    async (input: { base64: string; mime: string }) => {
      setError(null);
      setLoadingLabel("Tarif tahmin ediliyor…");
      setStage("loading");
      const operationIdentity = JSON.stringify({
        kind: "photo-estimate",
        ...input,
        recipeName: recipeName.trim(),
      });
      const operationKey = createOperationKeys.current.acquire(operationIdentity);
      try {
        const result = await estimateRecipeFromPhoto({
          operationKey,
          imageBase64: input.base64,
          imageMime: input.mime,
          recipeName: recipeName.trim() || undefined,
        });
        const loaded = await loadDraft(result.recipeId);
        createOperationKeys.current.succeed(operationIdentity, operationKey);
        setDraft(loaded);
        setEstimateMeta({ disclaimer: result.disclaimer, uncertainNotes: result.uncertainNotes });
        setPendingImage(null);
        setPreviewUri(null);
        setStage("review");
      } catch (e) {
        setError(
          e instanceof PhotoEstimateError ? e.message : "Tarif tahmin edilemedi. Tekrar dener misin?",
        );
        // Belirsizlik seçimine geri dön; seçilmiş görsel ve retry anahtarı
        // korunur, kamera/galeri akışı yeniden başlatılmaz.
        setStage("image-intent");
      }
    },
    [recipeName],
  );

  // Backend seçilen görselin yemek fotoğrafı mı yazılı tarif mi olduğunu
  // sınıflandırmıyor. Görsel önce bir kez seçilir; sonra kısa belirsizlik
  // sorusu gösterilir. Kamera/galeri seçimini ikinci kez yaptırmayız.
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
            ? "Kamera izni verilmedi. Fotoğraf çekebilmek için izin gerekiyor — galeriden seçmeyi ya da metin yapıştırmayı da deneyebilirsin."
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
        setError("Fotoğraf çok büyük. Daha yakından bir kare dener misin?");
        return;
      }
      setPreviewUri(asset.uri);
      setPendingImage({
        base64: asset.base64,
        mime: asset.mimeType ?? "image/jpeg",
        uri: asset.uri,
      });
      setStage("image-intent");
    },
    [],
  );

  const createManualDraft = useCallback(async () => {
    setError(null);
    setEstimateMeta(null);
    setLoadingLabel("Özel taslağın hazırlanıyor…");
    setStage("loading");
    try {
      const manualTitle = recipeName.trim() || "Yeni tarif";
      const result = await createManualPrivateRecipe({
        operationKeys: manualCreateOperationKeys.current,
        title: manualTitle,
      });
      // RPC'nin kanonik sonucu zaten id/version döndürüyor; hemen ardından
      // ayrı bir read yapıp başarılı create'i ağ hatası yüzünden tekrar
      // çalıştırma riskine girmeden aynı editor state'ini yerelde kur.
      setDraft({
        recipeId: result.recipeId,
        privateEditVersion: result.version,
        title: manualTitle,
        description: null,
        servings: "",
        prepMinutes: "",
        cookMinutes: "",
        restMinutes: "",
        difficulty: null,
        extractionConfidence: null,
        ingredients: [],
        steps: [
          {
            key: newKey("step"),
            instruction: "Hazırlama adımını buraya yaz.",
            timerMinutes: "",
            photoUrl: null,
          },
        ],
      });
      setStage("review");
    } catch (e) {
      setError(
        e instanceof PrivateRecipeMutationError
          ? e.message
          : "Taslak oluşturulamadı. Bağlantını kontrol edip tekrar dene.",
      );
      setStage("pick");
    }
  }, [recipeName]);

  const close = useCallback(async () => {
    // Taslak kaydedilmeden çıkılıyorsa silinir — yarım/bozuk bir kayıt
    // defterde birikmemeli. Düzenleme modunda (F7) bu YANLIŞ: `draft.recipeId`
    // burada var olan, zaten kaydedilmiş bir tarif — kaydetmeden çıkmak onu
    // silmemeli, yalnızca değişiklikleri atmalı.
    if (!isEditMode && stage === "review" && draft) {
      try {
        await discardDraft(draft.recipeId);
      } catch (e) {
        console.warn("[import] taslak silinemedi", e);
      }
    }
    router.back();
  }, [stage, draft, isEditMode]);

  // F7 — düzenlenecek tarif yüklenemedi (silinmiş, RLS reddetti, ağ hatası…).
  // Bu ekran taze bir import taslağı için tasarlandığından (bkz. "pick"
  // aşaması), edit modunda yükleme hatasında ona düşmüyoruz — kendi basit
  // hata durumu.
  if (isEditMode && loadFailed) {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text className="mt-3 text-center text-base font-medium text-hwhite">
          Tarif yüklenemedi
        </Text>
        <Text className="mt-1.5 text-center text-sm text-hmuted">
          Bağlantını kontrol edip tekrar dener misin?
        </Text>
        <Pressable onPress={() => router.back()} className="mt-6 rounded-xl bg-saffron px-6 py-3">
          <Text className="font-medium text-hwhite">Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  // ── 3d — Kaydedildi ───────────────────────────────────────────────────────
  if (stage === "saved") {
    return (
      <View
        className="flex-1 items-center justify-center bg-dark px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <Text style={{ fontSize: 44 }}>✅</Text>
        <Text className="mt-3 text-lg font-medium text-hwhite">
          {isEditMode ? "Değişiklikler kaydedildi" : "Defterine kaydedildi"}
        </Text>
        <Text className="mt-2 text-center text-sm text-hmuted">
          {isEditMode
            ? "Tarifin güncellendi."
            : "Bu tarif yalnızca sana görünür. Hasat'ın herkese açık tarifleriyle karışmaz."}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-xl bg-saffron px-6 py-3"
        >
          <Text className="font-medium text-hwhite">
            {isEditMode ? "Tarife dön" : "Defterime dön"}
          </Text>
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
        <ActivityIndicator color="#C8833B" size="large" accessibilityLabel={loadingLabel} />
        <Text className="mt-4 text-sm text-hwhite" accessibilityLiveRegion="polite">
          {isEditMode ? "Tarif yükleniyor…" : loadingLabel}
        </Text>
        {!isEditMode && loadingLabel !== "Özel taslağın hazırlanıyor…" && (
          <Text className="mt-1 text-center text-xs text-hmuted">
            Fotoğraflarda biraz daha uzun sürebilir.
          </Text>
        )}
      </View>
    );
  }

  // ── 3c — Düzelt/Onayla ────────────────────────────────────────────────────
  if (stage === "review" && draft) {
    const lowConfidence =
      draft.extractionConfidence != null && draft.extractionConfidence < LOW_CONFIDENCE_THRESHOLD;
    return (
      <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
        <View
          className="flex-row items-center justify-between border-b border-white/10 px-5 pb-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable onPress={close} hitSlop={12}>
            <Text className="text-xl text-hwhite">✕</Text>
          </Pressable>
          <Text className="text-base font-medium text-hwhite">
            {isEditMode ? "Tarifi Düzenle" : "Kontrol Et"}
          </Text>
          <Pressable
            disabled={saving}
            onPress={async () => {
              setError(null);
              setHasVersionConflict(false);
              if (isOffline) {
                setError("Kaydetmek için internet bağlantısı gerekiyor. Bağlantı gelince tekrar dene.");
                return;
              }
              setSaving(true);
              try {
                const savedDraft = await saveDraft(draft, updateOperationKeys.current);
                setDraft(savedDraft);
                void queryClient.invalidateQueries({ queryKey: MY_RECIPES_QUERY_KEY });
                setStage("saved");
              } catch (e) {
                if (e instanceof PrivateRecipeMutationError) {
                  setError(e.message);
                  setHasVersionConflict(e.code === "version_conflict");
                } else {
                  setError("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
                }
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
          {/* T7a kabul kriteri #1 — ZORUNLU: disclaimer küçük bir dipnot değil,
              belirgin bir banner olarak gösterilmeli. Kalın çerçeve + dolu
              arkaplan + emoji bilinçli — genel `lowConfidence` uyarısından
              (aşağıda, estimateMeta'da bastırılıyor) daha güçlü bir görünüm. */}
          {estimateMeta && (
            <View className="mb-4 rounded-xl border-2 border-gold bg-gold/25 p-3">
              <Text className="text-xs font-semibold text-hwhite">⚠️ {estimateMeta.disclaimer}</Text>
            </View>
          )}
          {/* T7a kabul kriteri #2 — uncertain_notes varsa ayrıca liste olarak. */}
          {estimateMeta && estimateMeta.uncertainNotes.length > 0 && (
            <View className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3">
              <Text className="mb-1 text-xs font-medium text-hwhite">
                Emin olunamayan noktalar
              </Text>
              {estimateMeta.uncertainNotes.map((note, i) => (
                <Text key={i} className="text-[11px] text-hmuted">
                  • {note}
                </Text>
              ))}
            </View>
          )}

          {lowConfidence && !estimateMeta && (
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
                steps: [
                  ...draft.steps,
                  { key: newKey("step"), instruction: "", timerMinutes: "", photoUrl: null },
                ],
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
              {s.photoUrl && (
                <View className="mt-2 flex-row items-center gap-2">
                  <Image source={{ uri: s.photoUrl }} className="h-14 w-14 rounded-lg" resizeMode="cover" />
                  <Pressable
                    onPress={() => {
                      const next = [...draft.steps];
                      next[i] = { ...s, photoUrl: null };
                      setDraft({ ...draft, steps: next });
                    }}
                    hitSlop={10}
                  >
                    <Text className="text-[11px] text-hmuted">Fotoğrafı kaldır</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

          {error && (
            <Text className="mt-4 text-xs text-hred" accessibilityRole="alert">
              {error}
            </Text>
          )}
          {hasVersionConflict && (
            <Pressable
              className="mt-3 self-start rounded-full border border-saffron px-3 py-2"
              onPress={async () => {
                setSaving(true);
                try {
                  const loaded = await loadDraft(draft.recipeId);
                  setDraft(loaded);
                  setHasVersionConflict(false);
                  setError(null);
                } catch {
                  setError("Güncel tarif yüklenemedi. Bağlantını kontrol edip tekrar dene.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Text className="text-xs font-medium text-saffron">Güncel halini yeniden yükle</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingScreen>
    );
  }

  // ── 3a — Kaynak seçimi / metin girişi ─────────────────────────────────────
  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
      <View
        className="flex-row items-center gap-3 px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          onPress={() => {
            if (stage === "text" || stage === "image-intent") {
              setStage("pick");
              return;
            }
            router.back();
          }}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={stage === "pick" ? "Tarif eklemeyi kapat" : "Geri dön"}
        >
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
            <Text className="mb-1 text-base font-medium text-hwhite">
              Ne eklemek istersin?
            </Text>
            <Text className="mb-5 text-sm text-hmuted">
              Eklediğin her tarif özel taslak olarak Defterim'e kaydolur ve yalnızca sana görünür.
            </Text>

            <Field label="Tarifin adı (opsiyonel)">
              <TextInput
                value={recipeName}
                onChangeText={setRecipeName}
                placeholder="Ör. Karnıyarık"
                placeholderTextColor="rgba(253,250,245,0.3)"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-base text-hwhite"
                accessibilityLabel="Tarifin adı, opsiyonel"
              />
            </Field>
            <Text className="mb-5 text-[11px] text-hmuted">
              Bu ad yalnızca fotoğrafı/metni doğru okumamıza yardımcı olur — eksik kalan adım
              veya malzemeyi bu isimden tamamlamayız.
            </Text>

            <View className="mb-3 rounded-2xl border border-white/15 bg-white/5 p-4">
              <Text className="text-base font-medium text-hwhite">Fotoğraf ekle</Text>
              <Text className="mb-3 mt-1 text-xs text-hmuted">
                Yemek fotoğrafı, kitap sayfası, not veya ekran görüntüsü olabilir.
              </Text>
              <View className="flex-row gap-3">
                <SmallAction
                  disabled={isOffline}
                  label="Kamera"
                  accessibilityLabel="Kamerayla tarif görseli çek"
                  onPress={() => void pickImage("camera")}
                />
                <SmallAction
                  disabled={isOffline}
                  label="Galeri"
                  accessibilityLabel="Galeriden tarif görseli seç"
                  onPress={() => void pickImage("library")}
                />
              </View>
            </View>
            <BigButton
              disabled={isOffline}
              label="Metin veya bağlantı yapıştır"
              hint="Tarif metnini yapıştır; desteklenmeyen bağlantılarda içeriğin korunur."
              onPress={() => setStage("text")}
            />
            <BigButton
              disabled={isOffline}
              label="Sıfırdan tarif oluştur"
              hint="Defterim'de yalnızca sana görünen boş bir taslak açar."
              onPress={() => void createManualDraft()}
            />
          </>
        ) : stage === "image-intent" && pendingImage ? (
          <>
            <Image
              source={{ uri: pendingImage.uri }}
              className="mb-5 h-48 w-full rounded-2xl"
              resizeMode="cover"
              accessibilityLabel="Seçilen tarif görseli önizlemesi"
            />
            <Text className="text-base font-medium text-hwhite">Bu görselde ne var?</Text>
            <Text className="mb-5 mt-1 text-sm text-hmuted">
              Görsel türünü güvenilir biçimde otomatik ayıramadık. Bir kez seçmen yeterli.
            </Text>
            <BigButton
              label="Yemek fotoğrafı"
              hint="Görüntüden olası bir tarif tahmin eder; kaydetmeden önce kontrol edersin."
              onPress={() =>
                void runEstimate({ base64: pendingImage.base64, mime: pendingImage.mime })
              }
            />
            <BigButton
              label="Yazılı tarif görseli"
              hint="Kitap sayfası, el yazısı not veya ekran görüntüsündeki tarifi okur."
              onPress={() =>
                void run({
                  mode: "photo",
                  base64: pendingImage.base64,
                  mime: pendingImage.mime,
                })
              }
            />
          </>
        ) : (
          <>
            <Text className="mb-2 text-sm text-hmuted">Tarif metnini veya bağlantısını yapıştır</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              placeholder={"Örn:\nMercimek çorbası\n\nMalzemeler\n- 1 su bardağı kırmızı mercimek\n…\n\nYapılışı\n1. …"}
              placeholderTextColor="rgba(253,250,245,0.3)"
              className="min-h-[220px] rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-hwhite"
              accessibilityLabel="Tarif metni veya bağlantısı"
            />
            <Pressable
              disabled={text.trim().length < 20 || isOffline}
              onPress={() => {
                const value = text.trim();
                if (/^https?:\/\//i.test(value)) {
                  setError(
                    "Bu bağlantı türü henüz desteklenmiyor. Metni buraya yapıştırabilirsin; yazdıkların silinmedi.",
                  );
                  return;
                }
                void run({ mode: "text", text: value });
              }}
              className="mt-4 items-center rounded-xl bg-saffron py-3.5"
              style={{ opacity: text.trim().length < 20 || isOffline ? 0.4 : 1 }}
              accessibilityRole="button"
              accessibilityLabel="Tarifi çıkar"
            >
              <Text className="font-medium text-hwhite">Tarifi Çıkar</Text>
            </Pressable>
          </>
        )}

        {error && (
          <Text className="mt-4 text-xs text-hred" accessibilityRole="alert">
            {error}
          </Text>
        )}
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
  hint,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="mb-3 min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-4"
      style={{ opacity: disabled ? 0.4 : 1 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text className="text-base text-hwhite">{label}</Text>
    </Pressable>
  );
}

function SmallAction({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="min-h-12 flex-1 items-center justify-center rounded-xl bg-saffron px-3"
      style={{ opacity: disabled ? 0.4 : 1 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
    >
      <Text className="font-medium text-hwhite">{label}</Text>
    </Pressable>
  );
}
