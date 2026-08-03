// P23-M6 — pişirme modu timer'ı.
//
// ÇEKİRDEK KARAR (görev metni, madde 1): kalan süre TICK SAYISIYLA DEĞİL,
// BİTİŞ ZAMAN DAMGASIYLA hesaplanır. `setInterval` yalnızca yeniden render
// tetikler; gerçek kalan süre her zaman `endsAt - Date.now()`. Gerekçe: React
// Native'in timer'ları uygulama arka plana alındığında kısılır/durur — 45
// dakikalık bir timer'ı tick sayarak takip etmek, kullanıcı uygulamadan çıkıp
// döndüğünde dakikalarca yanlış sonuç verir. Zaman damgası yaklaşımında arka
// planda hiç tick olmasa bile geri dönüşte doğru değer okunur.
//
// Kalıcılık: çalışan timer'ın `endsAt`'i AsyncStorage'a yazılır — uygulama
// tamamen kapatılıp açılsa da (mutfaktan ayrılma senaryosu) geri sayım kaldığı
// yerden görünür. Duraklatılmış timer'da kalan süre saklanır.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cancelScheduledNotification, scheduleTimerNotification } from "./notifications";

/** Şartnamedeki eşik (Build/P23-Mobile-Visual-Spec.md → "Uç durum — çok uzun
 * timer"): 1 saatin üstü geri sayılmaz, "uzun süreç" olarak metne döner —
 * `Cevizli Üzümlü Köme`'nin 3 günlük kurutması gibi adımlarda geri sayım
 * göstermek de bildirim kurmak da anlamsız. */
export const LONG_PROCESS_THRESHOLD_SECONDS = 3600;

interface PersistedTimer {
  /** Çalışıyorsa bitiş anı (epoch ms), duraklatılmışsa null. */
  endsAt: number | null;
  /** Duraklatılmışken kalan süre (ms). */
  remainingMs: number;
  notificationId: string | null;
}

function storageKey(recipeId: string, stepId: string): string {
  return `hasat-cook-timer:${recipeId}:${stepId}`;
}

export interface StepTimer {
  /** Bu adımda gerçek bir geri sayım var mı (timer_seconds dolu ve ≤ 1 saat). */
  available: boolean;
  /** 1 saati aşan "uzun süreç" adımı — geri sayım/bildirim yok, açıklama metni. */
  isLongProcess: boolean;
  remainingMs: number;
  running: boolean;
  finished: boolean;
  /** Kullanıcı "Süre doldu" uyarısını gördükten sonra çağrılır. */
  acknowledgeFinish: () => void;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  reset: () => Promise<void>;
}

export function useStepTimer(params: {
  recipeId: string | undefined;
  stepId: string | undefined;
  stepNo: number;
  recipeTitle: string;
  totalSeconds: number | null;
  /** Bildirim kurulmadan önce izin akışını yürüten çağıran taraf (pişirme
   * ekranı) — izin yoksa timer yine çalışır, sadece bildirim kurulmaz. */
  ensurePermission?: () => Promise<boolean>;
}): StepTimer {
  const { recipeId, stepId, stepNo, recipeTitle, totalSeconds, ensurePermission } = params;

  const totalMs = (totalSeconds ?? 0) * 1000;
  const isLongProcess = (totalSeconds ?? 0) > LONG_PROCESS_THRESHOLD_SECONDS;
  const available = (totalSeconds ?? 0) > 0 && !isLongProcess;

  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemainingMs, setPausedRemainingMs] = useState<number>(totalMs);
  const [finished, setFinished] = useState(false);
  const [, setTick] = useState(0);
  const notificationIdRef = useRef<string | null>(null);

  const key = recipeId && stepId ? storageKey(recipeId, stepId) : null;

  const persist = useCallback(
    async (value: PersistedTimer | null) => {
      if (!key) return;
      try {
        if (value === null) await AsyncStorage.removeItem(key);
        else await AsyncStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.warn("[cookTimer] durum yazılamadı", e);
      }
    },
    [key],
  );

  // Adım değiştiğinde/ilk mount'ta kayıtlı durumu geri yükle.
  useEffect(() => {
    let cancelled = false;
    setEndsAt(null);
    setPausedRemainingMs(totalMs);
    setFinished(false);
    notificationIdRef.current = null;
    if (!key || !available) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw) as PersistedTimer;
        notificationIdRef.current = saved.notificationId ?? null;
        if (saved.endsAt && saved.endsAt > Date.now()) {
          setEndsAt(saved.endsAt);
        } else if (saved.endsAt) {
          // Uygulama kapalıyken süre dolmuş — dönüşte bitmiş olarak göster.
          setEndsAt(null);
          setPausedRemainingMs(0);
          setFinished(true);
        } else {
          setPausedRemainingMs(Math.max(0, saved.remainingMs));
        }
      } catch (e) {
        console.warn("[cookTimer] durum okunamadı", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // totalMs adım değişince değiştiği için bağımlılıkta; key adım kimliğini taşıyor.
  }, [key, available, totalMs]);

  // Yalnızca yeniden render için — kalan süre HER ZAMAN endsAt'ten hesaplanıyor.
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [endsAt]);

  // Arka plandan dönüşte anında doğru değeri göster (interval kısılmış olabilir).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  const remainingMs = endsAt !== null ? Math.max(0, endsAt - Date.now()) : pausedRemainingMs;

  // Geri sayım bittiğinde durumu kapat (bildirim OS tarafında zaten teslim edildi).
  useEffect(() => {
    if (endsAt === null || remainingMs > 0) return;
    setEndsAt(null);
    setPausedRemainingMs(0);
    setFinished(true);
    notificationIdRef.current = null;
    void persist(null);
  }, [endsAt, remainingMs, persist]);

  const start = useCallback(async () => {
    if (!available) return;
    const base = remainingMs > 0 ? remainingMs : totalMs;
    const newEndsAt = Date.now() + base;
    setFinished(false);
    setEndsAt(newEndsAt);

    let notificationId: string | null = null;
    const permitted = ensurePermission ? await ensurePermission() : true;
    if (permitted) {
      notificationId = await scheduleTimerNotification({
        title: "Süre doldu",
        body: `${recipeTitle} · ${stepNo}. adım`,
        date: new Date(newEndsAt),
      });
    }
    notificationIdRef.current = notificationId;
    await persist({ endsAt: newEndsAt, remainingMs: base, notificationId });
  }, [available, remainingMs, totalMs, ensurePermission, recipeTitle, stepNo, persist]);

  const pause = useCallback(async () => {
    if (endsAt === null) return;
    const left = Math.max(0, endsAt - Date.now());
    setEndsAt(null);
    setPausedRemainingMs(left);
    await cancelScheduledNotification(notificationIdRef.current);
    notificationIdRef.current = null;
    await persist({ endsAt: null, remainingMs: left, notificationId: null });
  }, [endsAt, persist]);

  const reset = useCallback(async () => {
    setEndsAt(null);
    setPausedRemainingMs(totalMs);
    setFinished(false);
    await cancelScheduledNotification(notificationIdRef.current);
    notificationIdRef.current = null;
    await persist(null);
  }, [totalMs, persist]);

  const acknowledgeFinish = useCallback(() => setFinished(false), []);

  return {
    available,
    isLongProcess,
    remainingMs,
    running: endsAt !== null,
    finished,
    acknowledgeFinish,
    start,
    pause,
    reset,
  };
}

/** mm:ss (1 saatin altındaki tüm gerçek geri sayımlar için — eşik gereği
 * saat basamağına hiç ihtiyaç olmuyor, 3600 sn üstü "uzun süreç"). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
