// P23-M7-d — mobil alıcı onboarding'i. Web'de bu akış var
// (`hasat-d2c-marketplace/src/routes/onboarding.buyer.tsx`), mobilde hiç
// yoktu — yeni kayıt olan mobil kullanıcının `profiles.name` boş kalıyor,
// `buyer_profiles` satırı hiç oluşmuyordu.
//
// Kural #106: mantık DB'de mi client'ta mı diye önce incelendi. Web'in
// `finish()`'i DB yazımını RPC'ye değil doğrudan iki `supabase.from(...)`
// çağrısına yapıyor (profiles upsert + buyer_profiles insert) — yani bu
// akış zaten client-taraflı, DB'de tek bir doğruluk kaynağı yok. Burada aynı
// iki tabloya aynı alanlarla yazılıyor; yeni bir RPC icat edilmedi (web'in
// kendisi de RPC kullanmıyor).
//
// Bilinçli fark (raporlanıyor, kendi başına tasarlanmadı):
// - Web'in adım 2'si (ilgi alanı crop'ları) ve adım 3'ün adres alanı hiçbir
//   DB kolonuna yazılmıyor — `finish()` içinde yalnızca client-taraf
//   `useHasat` store'una gidiyorlar (`updateUser({crops, company:{address}})`).
//   Persist edilmeyen alanları mobile taşımak "aynı veri, aynı sonuç durumu"
//   barına bir şey katmıyor — bu yüzden mobil onboarding'de yok.
// - Web'in "30 gün ücretsiz Premium" adımı `activatePremium()` (TanStack
//   Start server function, `SUPABASE_SERVICE_ROLE_KEY` gerektiriyor) çağırıyor
//   — bu değişken Lovable Cloud'da eksik (bkz. TODO.md → Berkin'in açık
//   maddesi #6), web'de zaten "Premium deneme başlatılamadı" hatası veriyor.
//   Mobil bunu tekrarlamıyor: hem premium mobil v1'de hiç satılmıyor
//   (Store-Compliance.md → Bölüm 4, IAP), hem de bu server function mobilin
//   erişebileceği bir Supabase Edge Function değil (web app'in kendi sunucu
//   çalışma zamanına bağlı) — mobilden çağrılamaz.
import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";

const TYPES = [
  { id: "restoran", label: "Restoran" },
  { id: "otel", label: "Otel" },
  { id: "organik_market", label: "Organik Market" },
  { id: "ihracatci", label: "İhracatçı" },
  { id: "diger", label: "Diğer" },
] as const;

const VOLUMES = ["< 100g", "100g–1kg", "1–10kg", "10kg+"];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const setRole = useHasatMobileSession((s) => s.setRole);
  const updateUser = useHasatMobileSession((s) => s.updateUser);

  const [mode, setMode] = useState<"company" | "individual">("individual");
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["id"] | "">("");
  const [volume, setVolume] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dbType = mode === "individual" ? "bireysel" : type || "diger";
  const canSubmit = name.trim().length > 0 && (mode === "individual" || !!type);

  const finish = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setError("Oturum bulunamadı, lütfen tekrar giriş yapın.");
        router.replace("/login");
        return;
      }

      const { error: pErr } = await supabase.from("profiles").upsert({
        id: user.id,
        role: "buyer",
        name: name.trim(),
        phone: user.phone ? "+" + user.phone : null,
        buyer_type: dbType as never,
      });
      if (pErr) throw pErr;

      const { error: bErr } = await supabase.from("buyer_profiles").insert({
        user_id: user.id,
        company_name: name.trim(),
        company_type: dbType as never,
        monthly_volume: volume || null,
      });
      if (bErr) throw bErr;

      setRole("buyer");
      updateUser({ id: user.id, name: name.trim() });
      router.replace("/home");
    } catch (e) {
      setError((e as Error).message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-serif text-2xl text-hwhite">Hoş geldin</Text>
        <Text className="mt-1 text-sm text-hmuted">Üreticilerin seni tanıması için birkaç bilgi.</Text>

        <View className="mt-6 flex-row rounded-xl border border-white/10 bg-white/5 p-1">
          {(["individual", "company"] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  if (m === "individual") setType("");
                }}
                className={`flex-1 items-center rounded-lg py-2.5 ${on ? "bg-gold" : ""}`}
              >
                <Text className={`text-sm font-medium ${on ? "text-dark" : "text-hwhite"}`}>
                  {m === "individual" ? "Bireysel" : "Şirket"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-1 mt-5 text-xs text-hmuted">
          {mode === "individual" ? "Adınız Soyadınız" : "Şirket Adı"}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={mode === "individual" ? "Örn. Ayşe Yılmaz" : "Örn. Mikla Restaurant"}
          placeholderTextColor="rgba(253,250,245,0.3)"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-base text-hwhite"
        />

        {mode === "company" && (
          <>
            <Text className="mb-2 mt-5 text-xs text-hmuted">İşletme Tipi</Text>
            <View className="flex-row flex-wrap gap-2">
              {TYPES.map((t) => {
                const on = type === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setType(t.id)}
                    className={`rounded-xl border px-3.5 py-2.5 ${
                      on ? "border-gold bg-gold/20" : "border-white/10 bg-white/5"
                    }`}
                  >
                    <Text className="text-sm text-hwhite">{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text className="mb-2 mt-5 text-xs text-hmuted">Aylık Tahmini Hacim (opsiyonel)</Text>
        <View className="flex-row flex-wrap gap-2">
          {VOLUMES.map((v) => {
            const on = volume === v;
            return (
              <Pressable
                key={v}
                onPress={() => setVolume(on ? "" : v)}
                className={`rounded-xl border px-3.5 py-2.5 ${
                  on ? "border-gold bg-gold/20" : "border-white/10 bg-white/5"
                }`}
              >
                <Text className="text-sm text-hwhite">{v}</Text>
              </Pressable>
            );
          })}
        </View>

        {error && <Text className="mt-4 text-xs text-hred">{error}</Text>}

        <Pressable
          disabled={!canSubmit || saving}
          onPress={finish}
          className="mt-8 w-full items-center rounded-xl bg-gold py-3.5"
          style={{ opacity: !canSubmit || saving ? 0.4 : 1 }}
        >
          {saving ? <ActivityIndicator color="#1A1A14" /> : <Text className="font-medium text-dark">Keşfetmeye Başla →</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}
