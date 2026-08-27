import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import { Text } from "react-native";

export const APP_ICON_MAP = {
  back: { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
  bell: { ios: "bell.fill", android: "notifications", web: "notifications" },
  notificationPreferences: {
    ios: "bell.badge.fill",
    android: "notifications_active",
    web: "notifications_active",
  },
  notificationsOff: {
    ios: "bell.slash.fill",
    android: "notifications_off",
    web: "notifications_off",
  },
  orders: { ios: "shippingbox.fill", android: "package_2", web: "package_2" },
  profile: { ios: "person.crop.circle.fill", android: "person", web: "person" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  filter: {
    ios: "line.3.horizontal.decrease",
    android: "filter_list",
    web: "filter_list",
  },
  chevronRight: {
    ios: "chevron.right",
    android: "chevron_right",
    web: "chevron_right",
  },
  favorite: {
    ios: "heart",
    android: "favorite_border",
    web: "favorite_border",
  },
  favoriteSelected: { ios: "heart.fill", android: "favorite", web: "favorite" },
  mail: { ios: "envelope.fill", android: "mail", web: "mail" },
  success: {
    ios: "checkmark.circle.fill",
    android: "check_circle",
    web: "check_circle",
  },
  counter: {
    ios: "arrow.uturn.backward.circle.fill",
    android: "undo",
    web: "undo",
  },
  leaf: { ios: "leaf.fill", android: "eco", web: "eco" },
  close: { ios: "xmark", android: "close", web: "close" },
} as const satisfies Record<
  string,
  { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol }
>;

export type AppIconName = keyof typeof APP_ICON_MAP;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/** Existing Expo-native symbol family shared by iOS and Android. */
export function AppIcon({
  name,
  size = 22,
  color = "#8A8678",
  accessibilityLabel,
}: AppIconProps) {
  return (
    <SymbolView
      name={APP_ICON_MAP[name]}
      tintColor={color}
      size={size}
      accessibilityLabel={accessibilityLabel}
      fallback={
        <Text
          accessibilityLabel={accessibilityLabel}
          style={{ color, fontSize: size, lineHeight: size }}
        >
          •
        </Text>
      }
    />
  );
}
