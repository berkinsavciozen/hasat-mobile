import { useState } from "react";
import { AccessibilityInfo, Pressable, Share, Text, View } from "react-native";
import {
  privateRecipeShareUrl,
  shareExpiry,
  useCreateRecipeShareGrant,
  useRecipeShareGrants,
  useRevokeRecipeShareGrant,
  useRotateRecipeShareGrant,
} from "@/lib/hasat/privateRecipeShare";
import { useIsOffline } from "@/lib/net/useIsOffline";

const DURATIONS = [
  { label: "5 dk", value: 5 * 60_000 },
  { label: "1 saat", value: 60 * 60_000 },
  { label: "1 gün", value: 24 * 60 * 60_000 },
  { label: "7 gün", value: 7 * 24 * 60 * 60_000 },
  { label: "30 gün", value: 30 * 24 * 60 * 60_000 },
];

export function PrivateRecipeSharePanel({ recipeId, title }: { recipeId: string; title: string }) {
  const offline = useIsOffline();
  const [duration, setDuration] = useState(DURATIONS[3].value);
  const [message, setMessage] = useState<string | null>(null);
  const grants = useRecipeShareGrants(recipeId);
  const create = useCreateRecipeShareGrant(recipeId);
  const rotate = useRotateRecipeShareGrant(recipeId);
  const revoke = useRevokeRecipeShareGrant(recipeId);

  const announce = (text: string) => {
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
  };
  const shareToken = async (token: string) => {
    await Share.share({
      title: "Özel tarifim",
      message: `${title} — ${privateRecipeShareUrl(token)}`,
      url: privateRecipeShareUrl(token),
    });
  };
  const createLink = () => create.mutate(shareExpiry(duration), {
    onSuccess: ({ token }) => void shareToken(token).catch(() => announce("Link paylaşılamadı.")),
    onError: () => announce("Link oluşturulamadı. Bağlantını kontrol edip tekrar dene."),
  });
  const rotateLink = (grantId: string) => rotate.mutate({ grantId, expiresAt: shareExpiry(duration) }, {
    onSuccess: ({ token }) => void shareToken(token).catch(() => announce("Link paylaşılamadı.")),
    onError: () => announce("Link yenilenemedi. Tekrar deneyebilirsin."),
  });
  const revokeLink = (grantId: string) => revoke.mutate(grantId, {
    onSuccess: () => announce("Link kapatıldı."),
    onError: () => announce("Link kapatılamadı. Tekrar deneyebilirsin."),
  });
  const busy = offline || create.isPending || rotate.isPending || revoke.isPending;
  const active = (grants.data ?? []).filter((grant) => grant.status === "active");

  return (
    <View className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4" accessible={false}>
      <Text className="text-base font-medium text-hwhite">Özel olarak paylaş</Text>
      <Text className="mt-1 text-xs leading-5 text-hmuted">
        Alıcı giriş yaptıktan sonra medya içermeyen önizlemeyi görür ve özel taslak kopyasını Defterim’e ekleyebilir.
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {DURATIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => setDuration(option.value)}
            className={`min-h-12 justify-center rounded-xl border px-3 ${duration === option.value ? "border-saffron bg-saffron/15" : "border-white/10"}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: duration === option.value }}
            accessibilityLabel={`Paylaşım süresi ${option.label}`}
          >
            <Text className="text-sm text-hwhite">{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={createLink}
        disabled={busy}
        className="mt-3 min-h-12 items-center justify-center rounded-xl bg-saffron px-4 disabled:opacity-50"
        accessibilityRole="button"
        accessibilityLabel="Yeni özel paylaşım linki oluştur ve paylaş"
        accessibilityState={{ disabled: busy, busy: create.isPending }}
      >
        <Text className="font-medium text-dark">{create.isPending ? "Oluşturuluyor…" : "Paylaş"}</Text>
      </Pressable>
      {offline && <Text className="mt-2 text-xs text-gold">Bağlantı gelince link oluşturabilirsin.</Text>}
      {active.map((grant) => (
        <View key={grant.grant_id} className="mt-3 rounded-xl border border-white/10 p-3">
          <Text className="text-xs text-hmuted">{new Date(grant.expires_at).toLocaleString("tr-TR")} tarihine kadar açık</Text>
          <View className="mt-2 flex-row gap-2">
            <Pressable onPress={() => rotateLink(grant.grant_id)} disabled={busy} className="min-h-12 flex-1 items-center justify-center rounded-xl border border-white/15" accessibilityRole="button" accessibilityLabel="Linki yenile">
              <Text className="text-sm text-hwhite">Yenile</Text>
            </Pressable>
            <Pressable onPress={() => revokeLink(grant.grant_id)} disabled={busy} className="min-h-12 flex-1 items-center justify-center rounded-xl" accessibilityRole="button" accessibilityLabel="Linki kapat">
              <Text className="text-sm text-hmuted">Kapat</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {message && <Text className="mt-2 text-xs text-hmuted" accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}
