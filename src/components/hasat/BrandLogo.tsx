// Hasat OS Milestone 3 — Brand Identity Freeze (W2 wordmark + M1 monogram,
// M1 güncellemesi: küçük ölçekte "H" okunurluğu için stroke 18→22 + tek
// eğri). Kaynak SVG'ler: assets/brand/*.svg — path geometrisi burada
// TEKRARLANIYOR (react-native-svg XML parse etmiyor, native <Path>
// component'leri istiyor), path verisi assets/brand'daki dosyalarla birebir
// aynı olmalı.
import Svg, { G, Line, Path, Rect } from "react-native-svg";
import type { StyleProp, ViewStyle } from "react-native";

export type BrandLogoVariant = "wordmark" | "monogram" | "lockup";
/** "light" = açık zeminde varsayılan deep-blue işaret. "dark" = koyu zeminde (örn. bg-dark #1A1A14) beyaz işaret; path geometrisi aynı, yalnızca renk override. */
export type BrandLogoTone = "light" | "dark";

const NATIVE_SIZE: Record<BrandLogoVariant, { width: number; height: number }> = {
  wordmark: { width: 666, height: 200 },
  monogram: { width: 160, height: 160 },
  lockup: { width: 830, height: 210 },
};

const WORDMARK_LETTER_PATHS = [
  "M10.8984375 180.0H34.1015625V123.22265625H94.482421875V180.0H117.7734375V49.04296875H94.482421875V103.095703125H34.1015625V49.04296875H10.8984375Z",
  "M139.814453125 180.0H164.775390625L175.498046875 148.7109375H226.298828125L236.7578125 180.0H262.333984375L215.751953125 49.04296875H186.572265625ZM182.001953125 129.638671875 188.330078125 111.181640625C192.28515625 99.140625 196.240234375 86.572265625 201.162109375 70.048828125C206.083984375 86.572265625 209.951171875 99.140625 213.818359375 111.181640625L219.970703125 129.638671875Z",
  "M331.748046875 182.109375C362.7734375 182.109375 382.197265625 166.640625 382.197265625 142.20703125C382.197265625 122.958984375 369.98046875 111.62109375 342.822265625 105.556640625L329.55078125 102.48046875C312.5 98.525390625 305.732421875 93.603515625 305.732421875 84.814453125C305.732421875 74.091796875 316.015625 66.62109375 330.517578125 66.62109375C345.810546875 66.62109375 355.830078125 74.970703125 356.796875 88.76953125H378.857421875C378.06640625 62.75390625 359.873046875 46.93359375 330.60546875 46.93359375C301.689453125 46.93359375 282.44140625 62.578125 282.44140625 85.95703125C282.44140625 104.326171875 294.482421875 115.83984375 320.673828125 121.81640625L334.736328125 124.98046875C352.2265625 129.0234375 359.08203125 134.384765625 359.08203125 143.61328125C359.08203125 155.126953125 348.271484375 162.509765625 331.923828125 162.509765625C313.73046875 162.509765625 302.83203125 153.10546875 302.65625 137.28515625H279.892578125C279.892578125 165.322265625 299.31640625 182.109375 331.748046875 182.109375Z",
  "M399.755859375 180.0H424.716796875L435.439453125 148.7109375H486.240234375L496.69921875 180.0H522.275390625L475.693359375 49.04296875H446.513671875ZM441.943359375 129.638671875 448.271484375 111.181640625C452.2265625 99.140625 456.181640625 86.572265625 461.103515625 70.048828125C466.025390625 86.572265625 469.892578125 99.140625 473.759765625 111.181640625L479.912109375 129.638671875Z",
  "M537.4609375 69.169921875H578.2421875V180.0H601.533203125V69.169921875H642.138671875V49.04296875H537.4609375Z",
];

function WordmarkGlyphs({ ink, accent }: { ink: string; accent: string }) {
  return (
    <>
      {WORDMARK_LETTER_PATHS.map((d) => (
        <Path key={d.slice(0, 12)} d={d} fill={ink} />
      ))}
      <Rect x={355} y={83} width={18} height={16} rx={3} fill={accent} />
    </>
  );
}

function MonogramGlyphs({ ink }: { ink: string }) {
  return (
    <>
      <Path d="M 28 138 V 22" fill="none" stroke={ink} strokeWidth={22} strokeLinecap="round" />
      <Path d="M 100 22 V 138" fill="none" stroke={ink} strokeWidth={22} strokeLinecap="round" />
      <Path
        d="M 28 98 C 55 98, 60 78, 100 62"
        fill="none"
        stroke={ink}
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

export function BrandLogo({
  variant = "wordmark",
  tone = "light",
  height = 32,
  style,
}: {
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  /** Render yüksekliği (px) — genişlik native aspect ratio korunarak hesaplanır. */
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { width: nativeWidth, height: nativeHeight } = NATIVE_SIZE[variant];
  const width = (height * nativeWidth) / nativeHeight;
  const ink = tone === "dark" ? "#FFFFFF" : "#0D3B66";
  const accent = tone === "dark" ? "#0D3B66" : "#FFFFFF";
  const divider = tone === "dark" ? "#4A5568" : "#D6D6D6";

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${nativeWidth} ${nativeHeight}`}
      style={style}
      accessibilityRole="image"
      accessibilityLabel="Hasat"
    >
      {variant === "wordmark" && <WordmarkGlyphs ink={ink} accent={accent} />}
      {variant === "monogram" && <MonogramGlyphs ink={ink} />}
      {variant === "lockup" && (
        <>
          <G transform="translate(10,10)">
            <WordmarkGlyphs ink={ink} accent={accent} />
          </G>
          <Line x1={625} y1={40} x2={625} y2={170} stroke={divider} strokeWidth={2} />
          <G transform="translate(650,20) scale(0.95)">
            <MonogramGlyphs ink={ink} />
          </G>
        </>
      )}
    </Svg>
  );
}
