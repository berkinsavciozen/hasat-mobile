import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase/client";
import { useHasatMobileSession } from "@/lib/store/session";
import { takePendingSessionMessage } from "@/lib/hasat/sessionGuard";
import { KeyboardAvoidingScreen } from "@/components/hasat/KeyboardAvoidingScreen";
import { BrandLogo } from "@/components/hasat/BrandLogo";

/**
 * Telefon OTP girişi — web'deki akışın aynısı (`src/routes/login.tsx`):
 * signInWithOtp(phone) → verifyOtp → profile fetch → role'e göre yönlendirme.
 * Format: 905XXXXXXXXX (DB'de + prefix'siz saklanır, bkz. _Context.md "Phone
 * format"), Supabase'e gönderilirken E.164 (+905XXXXXXXXX) kullanılır.
 *
 * Kapsam (M5-a): sadece giriş. Rol seçimi/onboarding akışı ve tarif
 * ekranları M5-b.
 */
function translateAuthError(e: Error): string {
  const m = (e?.message || "").toLowerCase();
  if (
    m.includes("expired") ||
    (m.includes("invalid") && m.includes("token")) ||
    m.includes("otp")
  ) {
    return "Kod hatalı veya süresi dolmuş. Tekrar deneyin.";
  }
  if (m.includes("rate") || m.includes("too many") || m.includes("limit")) {
    return "Çok fazla deneme. Lütfen biraz bekleyin.";
  }
  if (m.includes("phone")) return "Telefon numarası geçersiz.";
  return e?.message || "Bir hata oluştu.";
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const updateUser = useHasatMobileSession((s) => s.updateUser);
  const setRole = useHasatMobileSession((s) => s.setRole);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  const inputsRef = useRef<(TextInput | null)[]>([]);

  // P23-M8-b — silinmiş/yasaklı bir hesabın oturumu bir şekilde canlı
  // kalıp da sessionGuard tarafından zorla kapatıldığında ("banned_until
  // nedeniyle her istek reddedilecek, uygulama bunu anlamlı bir mesajla
  // karşılamalı" — bkz. sessionGuard.ts) burada gösterilir.
  useEffect(() => {
    const msg = takePendingSessionMessage();
    if (msg) setError(msg);
  }, []);

  useEffect(() => {
    if (step !== "otp") return;
    setCountdown(30);
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [step]);

  // TR yerel format: baştaki 0'ı at, 10 haneyi al (5XX XXX XX XX)
  const phoneDigits = phone.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10);

  const sendOtp = async () => {
    if (phoneDigits.length !== 10 || sending) return;
    setSending(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        phone: "+90" + phoneDigits,
        // P23-M7-d kök neden düzeltmesi: web'in `src/routes/login.tsx`'i
        // `options.data.role`'ü `raw_user_meta_data`'ya yazıyor, `handle_new_user()`
        // trigger'ı bunu okuyup `profiles.role`'e yazıyor (yoksa 'farmer'a
        // düşüyor — bkz. fonksiyon tanımı). Mobil bu alanı hiç göndermiyordu,
        // bu yüzden her yeni mobil kayıt sessizce 'farmer' oluyordu. Mobil v1
        // yalnızca tüketici tarafı olduğu için (`_Context.md` → "Mobil v1
        // kapsamı") burada sabit 'buyer' — web'deki gibi parametrik bir rol
        // seçici mobilde yok, yeni bir mekanizma icat edilmedi, aynı
        // `raw_user_meta_data.role` sözleşmesi kullanıldı (kural #106).
        options: { data: { role: "buyer" } },
      });
      if (err) throw err;
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
    } catch (e) {
      setError(translateAuthError(e as Error));
    } finally {
      setSending(false);
    }
  };

  const resend = () => {
    if (countdown > 0) return;
    sendOtp();
  };

  const handleOtpChange = (i: number, val: string) => {
    const digits = val.replace(/\D/g, "");
    // P23-M8-d (T4) — bulgu S33 adım 43: iOS'un SMS'ten önerdiği koda
    // dokunulduğunda kodun TAMAMI odaklanılan tek kutuya birden geliyordu;
    // eski kod yalnızca son haneyi alıp (`slice(-1)`) geri kalanı atıyordu,
    // bu yüzden yalnızca ilk hane doluyordu. Şimdi birden fazla hane gelirse
    // (autofill/yapıştırma) `i`'den başlayarak sıradaki kutulara dağıtılıyor.
    if (digits.length > 1) {
      const next = [...otp];
      let idx = i;
      for (const d of digits) {
        if (idx > 5) break;
        next[idx] = d;
        idx++;
      }
      setOtp(next);
      if (idx > 5) inputsRef.current[5]?.blur();
      else inputsRef.current[idx]?.focus();
      return;
    }
    const next = [...otp];
    next[i] = digits;
    setOtp(next);
    if (digits && i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleOtpKey = (i: number, key: string) => {
    if (key === "Backspace" && !otp[i] && i > 0)
      inputsRef.current[i - 1]?.focus();
  };

  const verify = async () => {
    if (otp.some((d) => !d) || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        phone: "+90" + phoneDigits,
        token: otp.join(""),
        type: "sms",
      });
      if (err || !data.user) throw err ?? new Error("Doğrulama başarısız");

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      if (profileErr) throw profileErr;

      const role = profile.role === "buyer" ? "buyer" : "farmer";
      setRole(role, data.user.id);
      updateUser({
        id: data.user.id,
        name: profile.name ?? undefined,
        phone: "90" + phoneDigits,
        city: profile.city ?? undefined,
        premium: !!profile.premium,
      });
      // Web'in `src/routes/login.tsx`'iyle aynı dal: profil adı boşsa (yeni
      // kayıt) onboarding'e, doluysa doğrudan ana ekrana.
      const hasProfile = !!profile.name && profile.name.trim() !== "";
      router.replace(hasProfile ? "/home" : "/onboarding");
    } catch (e) {
      setError(translateAuthError(e as Error));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingScreen style={{ backgroundColor: "#1A1A14" }}>
      <View
        className="flex-1 items-center justify-center px-6"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Lockup değil, monogram+wordmark ayrı ayrı: assets/brand/hasat-lockup.svg'deki
            ayırıcı çizgi (x=625) wordmark'ın son harfinin ("T", ink sağ kenarı ~x=652)
            üzerinden geçiyor — frozen kaynak dosyadaki bir kusur, path geometrisi
            değiştirilemediği için burada kendi dikey spacing'imizle birleştirdik. */}
        <View className="mb-10 items-center">
          <BrandLogo
            variant="monogram"
            tone="dark"
            height={48}
            style={{ marginBottom: 10 }}
          />
          <BrandLogo variant="wordmark" tone="dark" height={30} />
        </View>

        <View className="w-full max-w-sm">
          {step === "phone" ? (
            <>
              <Text className="text-hmuted text-xs mb-2">
                Telefon Numaranız
              </Text>
              <View className="flex-row items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
                <Text className="text-hwhite text-sm bg-white/10 rounded-md px-2 py-1">
                  🇹🇷 +90
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="number-pad"
                  placeholder="5XX XXX XX XX"
                  placeholderTextColor="rgba(253,250,245,0.3)"
                  className="flex-1 text-hwhite text-base"
                  maxLength={13}
                />
              </View>
              <Pressable
                disabled={phoneDigits.length !== 10 || sending}
                onPress={sendOtp}
                className="mt-6 w-full rounded-xl py-3 items-center bg-saffron disabled:opacity-40"
                style={{
                  opacity: phoneDigits.length !== 10 || sending ? 0.4 : 1,
                }}
              >
                {sending ? (
                  <ActivityIndicator color="#FDFAF5" />
                ) : (
                  <Text className="text-hwhite font-medium">Kod Gönder →</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <View className="items-center mb-4">
                <Text className="text-hmuted text-xs">+90 {phoneDigits}</Text>
                <Text className="text-hwhite text-sm mt-1">
                  6 haneli kodu girin
                </Text>
              </View>
              <View className="flex-row justify-between gap-1">
                {otp.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    value={d}
                    onChangeText={(v) => handleOtpChange(i, v)}
                    onKeyPress={(e) => handleOtpKey(i, e.nativeEvent.key)}
                    keyboardType="number-pad"
                    // P23-M8-d (T4): `maxLength={1}` her kutuyu tek haneye
                    // KISITLIYORDU — iOS'un SMS önerisi kodun tamamını (6 hane)
                    // odaklanılan kutuya tek seferde yazmaya çalışınca native
                    // katman bunu 1 haneye kırpıyordu, JS'e hiç ulaşmıyordu
                    // (bulgunun kök nedeni tam olarak buydu). Kutu zaten
                    // controlled (`value={d}`) — her render'da tek haneye geri
                    // dönüyor, bu yüzden 6'ya çıkarmak elle yazmayı bozmuyor,
                    // yalnızca autofill'in tam kodu JS'e ulaştırmasına izin
                    // veriyor (dağıtım `handleOtpChange`'de yapılıyor).
                    maxLength={6}
                    // Yalnızca ilk kutuda olması autofill şeridinin sadece o
                    // kutu odaktayken görünmesine yol açıyordu; tüm kutularda
                    // aynı content type autofill'in her zaman tetiklenmesini
                    // sağlıyor.
                    textContentType="oneTimeCode"
                    autoComplete={
                      Platform.OS === "android" ? "sms-otp" : undefined
                    }
                    className="w-11 h-14 text-center rounded-lg border border-white/15 bg-white/5 text-hwhite text-xl"
                  />
                ))}
              </View>
              <View className="mt-3 items-center">
                {countdown > 0 ? (
                  <Text className="text-hmuted text-xs">
                    Tekrar gönder ({countdown}s)
                  </Text>
                ) : (
                  <Pressable onPress={resend}>
                    <Text className="text-hwhite text-xs underline">
                      Tekrar gönder
                    </Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                disabled={otp.some((d) => !d) || verifying}
                onPress={verify}
                className="mt-6 w-full rounded-xl py-3 items-center bg-saffron"
                style={{ opacity: otp.some((d) => !d) || verifying ? 0.4 : 1 }}
              >
                {verifying ? (
                  <ActivityIndicator color="#FDFAF5" />
                ) : (
                  <Text className="text-hwhite font-medium">Giriş Yap ✓</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setStep("phone")} className="mt-3">
                <Text className="text-hmuted text-xs text-center">
                  ← Numarayı değiştir
                </Text>
              </Pressable>
            </>
          )}
          {error ? (
            <Text className="text-hred text-xs mt-4 text-center">{error}</Text>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingScreen>
  );
}
