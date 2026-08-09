// Marketplace fallback zinciri (hasat-vault/Build/DB-Schema.md → M3 kararı,
// bu turda web'in `crop-config.ts`'teki `resolveListingPhoto`'suyla aynı
// mantıkla mobile marketplace yüzeylerine de uygulandı): gerçek ilan
// fotoğrafı → crop_config.default_photo_url → null (çağıran taraf null'ı
// RepresentativePhoto'nun nötr placeholder'ına çevirir). `isRepresentative`,
// gösterilen görsel gerçek ilan fotoğrafı DEĞİLSE true.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export function useCropDefaultPhoto(crop: string | undefined) {
  return useQuery({
    queryKey: ["cropDefaultPhoto", crop],
    enabled: !!crop,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("crop_config")
        .select("default_photo_url")
        .eq("crop", crop!)
        .maybeSingle();
      if (error) throw error;
      return data?.default_photo_url ?? null;
    },
  });
}

export function resolveListingPhoto(
  photos: string[] | null | undefined,
  defaultPhotoUrl: string | null | undefined,
): { photoUrl: string | null; isRepresentative: boolean } {
  const real = photos?.[0];
  if (real) return { photoUrl: real, isRepresentative: false };
  const fallback = defaultPhotoUrl ?? null;
  return { photoUrl: fallback, isRepresentative: !!fallback };
}
