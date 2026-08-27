import { SymbolView, type SymbolViewProps } from "expo-symbols";

type AppIconProps = {
  name: SymbolViewProps["name"];
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/** Existing Expo-native symbol family shared by iOS and Android. */
export function AppIcon({
  name,
  size = 22,
  color = "#A9C7CF",
  accessibilityLabel,
}: AppIconProps) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
