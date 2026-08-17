// P23-M8-d (T4) — klavye açıldığında altındaki içeriğin (arama kutusu +
// filtrelenen liste, form alanları, "Kaydet"/"Gönder" butonu) klavyenin
// arkasında kalması. Bulgu S33 adım 27: `CropPickerModal`'da arama sonucu
// listesi klavyenin altında kalıyor, seçim yapılamıyordu.
//
// Kök neden: `Modal` (`CropPickerModal`/`CropRequestSheet`/`DeleteAccountModal`)
// kendi native pencere hiyerarşisini kullanıyor — Android'in Activity
// seviyesindeki `windowSoftInputMode=adjustResize`'ı miras almıyor, bu yüzden
// Modal içinde klavye açılınca içerik kendiliğinden yukarı kaymıyor. Tam ekran
// rotalarda (`onboarding.tsx`) da aynı sınıf bulgu vardı: klavye açılan tek
// `TextInput`'un altında kalan alanlara (işletme tipi/hacim/"Keşfetmeye
// Başla") kaydırma imkanı bile yoktu.
//
// Tek çözüm: bu bileşen. Projedeki klavye açan HER ekran/modal (Modal-içi
// dahil) `KeyboardAvoidingView` mantığını kendi başına tekrarlamak yerine
// buradan alır — `behavior="height"` Android'de Modal'ın adjustResize
// eksikliğine karşı en güvenilir davranış (RN dokümantasyonu + yaygın
// pratik), iOS'ta zaten standart olan "padding" korunuyor.
//
// ⚠️ Doğrulanamadı (kural #103): gerçek cihaz/simülatör bu oturumda yok,
// yalnızca `tsc --noEmit` ile doğrulandı — gerçek klavye davranışı Berkin'in
// cihaz testinde koşulmalı.
import { KeyboardAvoidingView, Platform, type ViewStyle, type StyleProp } from "react-native";

export function KeyboardAvoidingScreen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
