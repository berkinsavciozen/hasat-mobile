// Nativewind config — marka renkleri `hasat-core`'dan geliyor, burada
// KOPYALANMIYOR. `src/lib/core/design/tokens.ts` hasat-core'dan git subtree
// ile iner (bkz. hasat-vault/Build/Shared-Architecture.md); bu dosya o
// tokens.ts'i doğrudan require ediyor, böylece web ve mobil arasında marka
// rengi sapması (aynı riskin dispatch_sms/send-sms'te iki kez yaşanmış hali,
// bkz. TODO.md kural #106) buraya da bulaşmaz.
//
// Not: Node'un TypeScript dosyalarını doğrudan require edebilmesi (tip
// temizleme / "type stripping") bu projenin geliştirme ortamındaki Node
// sürümünde (22.x, 2026 itibarıyla varsayılan) çalışıyor. Bu adım ileride bir
// EAS build imajında/daha eski bir Node'da başarısız olursa, aşağıdaki
// try/catch bilinçli bir sabit yedeğe düşer — token'lar YİNE hasat-core'dan
// gelir, sadece elle bir "son bilinen iyi" kopyası kullanılır; bu satırlar
// güncellenirse konsola uyarı basar.
const path = require("node:path");

let tokens;
try {
  tokens = require(path.join(__dirname, "src/lib/core/design/tokens.ts"));
} catch (err) {
  console.warn(
    "[tailwind.config] hasat-core design/tokens.ts require edilemedi, sabit yedek kullanılıyor:",
    err && err.message,
  );
  tokens = {
    brand: {
      saffron: "#C8833B",
      sage: "#6B8F5E",
      cream: "#F7F2E8",
      dark: "#1A1A14",
      hmuted: "#8A8678",
      gold: "#D4A843",
      lav: "#8B9BF0",
      hred: "#C0392B",
      hwhite: "#FDFAF5",
    },
    semanticLight: {
      background: "#F0EBE0",
      foreground: "#1A1A14",
      card: "#F7F2E8",
      cardForeground: "#1A1A14",
      primary: "#C8833B",
      primaryForeground: "#FDFAF5",
      secondary: "#F7F2E8",
      secondaryForeground: "#1A1A14",
      muted: "#E8E1D3",
      mutedForeground: "#8A8678",
      accent: "#D4A843",
      accentForeground: "#1A1A14",
      destructive: "#C0392B",
      destructiveForeground: "#FDFAF5",
      border: "#E1D9C7",
    },
  };
}

const { brand, semanticLight } = tokens;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ...brand,
        background: semanticLight.background,
        foreground: semanticLight.foreground,
        card: semanticLight.card,
        "card-foreground": semanticLight.cardForeground,
        primary: semanticLight.primary,
        "primary-foreground": semanticLight.primaryForeground,
        secondary: semanticLight.secondary,
        "secondary-foreground": semanticLight.secondaryForeground,
        muted: semanticLight.muted,
        "muted-foreground": semanticLight.mutedForeground,
        accent: semanticLight.accent,
        "accent-foreground": semanticLight.accentForeground,
        destructive: semanticLight.destructive,
        "destructive-foreground": semanticLight.destructiveForeground,
        border: semanticLight.border,
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "14px",
      },
    },
  },
  plugins: [],
};
