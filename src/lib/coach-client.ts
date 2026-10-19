import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Sadece "Compos Kişisel" varyantında (eas.json `personal` profili) açık.
export const IS_PERSONAL = process.env.EXPO_PUBLIC_PERSONAL === 'true';

export type CoachMessage = {
  id: string;
  created_at: string;
  role: 'user' | 'assistant';
  content: string;
  source: 'app' | 'proactive';
  read_at: string | null;
  kaynaklar: { id: string; etiket: string }[];
  islemler: { tool: string; islem_id: string | null }[];
  /** Sunucuda bekliyor: kota/model/bağlantı dönünce otomatik cevaplanacak. */
  bekliyor?: boolean;
  /** Koç bu mesajın cevabını şu an sunucuda hazırlıyor (uygulama kapansa da sürer). */
  yanitlaniyor?: boolean;
  /** Mesajla gönderilmiş bir görsel var (sunucudan /images/<id> ile gelir). */
  gorsel?: boolean;
  /** Sadece uygulamada: giden kutusunda, henüz sunucuya ulaşmadı. */
  gonderilmedi?: boolean;
  /** Sadece uygulamada: giden kutusundaki görselin telefondaki dosyası. */
  localImage?: string;
};

export type CoachConfig = { url: string; key: string };

const CONFIG_KEY = 'coach-config';

// expo-secure-store'un web sürümü boş bir stub (supabase.ts'teki adaptörle aynı sebep).
async function readStored(): Promise<string | null> {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(CONFIG_KEY);
  return SecureStore.getItemAsync(CONFIG_KEY);
}

export async function loadCoachConfig(): Promise<CoachConfig | null> {
  const raw = await readStored();
  return raw ? (JSON.parse(raw) as CoachConfig) : null;
}

export async function saveCoachConfig(config: CoachConfig) {
  const raw = JSON.stringify({ url: config.url.trim().replace(/\/+$/, ''), key: config.key.trim() });
  if (Platform.OS === 'web') localStorage.setItem(CONFIG_KEY, raw);
  else await SecureStore.setItemAsync(CONFIG_KEY, raw);
}

export class CoachError extends Error {
  /** true: sunucuya hiç ulaşılamadı (internet yok, sunucu kapalı) — mesaj giden kutusunda bekler. */
  network: boolean;
  constructor(message: string, network = false) {
    super(message);
    this.network = network;
  }
}

export async function coachFetch<T>(config: CoachConfig, path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20000);
  try {
    const res = await fetch(`${config.url}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        // Koç Compos verine senin oturumunla (RLS altında) erişir.
        ...(session ? { 'X-Supabase-Token': session.access_token } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new CoachError(json.hata ?? `Sunucu hatası (${res.status})`);
    return json as T;
  } catch (e) {
    if (e instanceof CoachError) throw e;
    if ((e as Error).name === 'AbortError') throw new CoachError('Koç sunucusu yanıt vermedi (zaman aşımı).', true);
    throw new CoachError('Koç sunucusuna ulaşılamadı. Sunucu açık ve aynı ağda mı?', true);
  } finally {
    clearTimeout(timer);
  }
}

export type CoachPlanSet = { kg?: number; reps?: number; rir?: number };
export type CoachTodaySession = {
  plan_session_id: string;
  ad: string;
  durum: 'planli' | 'yapildi' | 'atlandi';
  program_day_id: string | null;
  hareketler: { hareket: string; set: number }[];
};
export type CoachDayTargets = {
  plan_session_id: string;
  ad: string;
  hareketler: { exercise_id: string; hareket: string; setler: CoachPlanSet[]; not?: string | null }[];
};

export function useCoachConfig() {
  const [config, setConfig] = useState<CoachConfig | null>(null);
  useEffect(() => {
    if (IS_PERSONAL) loadCoachConfig().then(setConfig).catch(() => {});
  }, []);
  return config;
}

/** Koç planından başlatılan antrenmanın hedefleri: exercise_id → set hedefleri. Sadece Compos Kişisel'de. */
export function useCoachDayTargets(programDayId: string | null | undefined) {
  const config = useCoachConfig();
  const [targets, setTargets] = useState<Record<string, CoachPlanSet[]> | null>(null);
  useEffect(() => {
    if (!IS_PERSONAL || !config || !programDayId) return;
    let cancelled = false;
    coachFetch<{ targets: CoachDayTargets | null }>(config, `/plan/day/${programDayId}`)
      .then((res) => {
        if (cancelled || !res.targets) return;
        setTargets(Object.fromEntries(res.targets.hareketler.map((h) => [h.exercise_id, h.setler])));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config, programDayId]);
  return targets;
}


// --- Giden kutusu: sunucuya ulaşılamazken yazılan mesajlar telefonda bekler, bağlantı gelince sırayla gider ---

export type OutboxItem = { id: string; text: string; created_at: string; image?: string };
const OUTBOX_FILE = `${FileSystem.documentDirectory ?? ''}coach-outbox.json`;
// Seçilen fotoğraf önbellekten (OS silebilir) buraya kopyalanır; sunucu alınca silinir.
const OUTBOX_IMAGE_DIR = `${FileSystem.documentDirectory ?? ''}coach-outbox/`;

/** Mesajdaki görselin sunucudaki adresi (Image source'u için, anahtar başlıkta). */
export function coachImageSource(config: CoachConfig, messageId: string) {
  return { uri: `${config.url}/images/${messageId}`, headers: { Authorization: `Bearer ${config.key}` } };
}

async function readOutbox(): Promise<OutboxItem[]> {
  try {
    if (Platform.OS === 'web') return JSON.parse(localStorage.getItem('coach-outbox') ?? '[]');
    const info = await FileSystem.getInfoAsync(OUTBOX_FILE);
    return info.exists ? JSON.parse(await FileSystem.readAsStringAsync(OUTBOX_FILE)) : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: OutboxItem[]) {
  if (Platform.OS === 'web') localStorage.setItem('coach-outbox', JSON.stringify(items));
  else await FileSystem.writeAsStringAsync(OUTBOX_FILE, JSON.stringify(items));
}

export async function loadOutbox() {
  return readOutbox();
}

export async function queueOutgoing(text: string, imageUri?: string): Promise<OutboxItem> {
  const id = `out-${Date.now()}`;
  let image: string | undefined;
  if (imageUri) {
    if (Platform.OS === 'web') image = imageUri;
    else {
      await FileSystem.makeDirectoryAsync(OUTBOX_IMAGE_DIR, { intermediates: true });
      image = `${OUTBOX_IMAGE_DIR}${id}.jpg`;
      await FileSystem.copyAsync({ from: imageUri, to: image });
    }
  }
  const item: OutboxItem = { id, text, created_at: new Date().toISOString(), ...(image && { image }) };
  await writeOutbox([...(await readOutbox()), item]);
  return item;
}

async function readBase64(uri: string): Promise<string | undefined> {
  if (Platform.OS !== 'web') {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }) : undefined;
  }
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

let flushing = false;

/** Bekleyen mesajları sırayla gönderir. Sunucu mesajı aldığı an (200 ya da 202 'bekliyor') kutudan çıkar. */
export async function flushOutbox(config: CoachConfig): Promise<{ sent: number; error: string | null }> {
  if (flushing) return { sent: 0, error: null };
  flushing = true;
  let sent = 0;
  try {
    for (const item of await readOutbox()) {
      try {
        // client_id: zaman aşımı sonrası tekrar gönderimde sunucu aynı mesajı ikinci kez işlemez.
        const image = item.image ? await readBase64(item.image) : undefined;
        // Sunucu mesajı alıp hemen döner; cevap arka planda hazırlanır, /messages ile gelir.
        await coachFetch(config, '/chat', { method: 'POST', body: { text: item.text, client_id: item.id, image }, timeoutMs: 60000 });
      } catch (e) {
        if (e instanceof CoachError && e.network) return { sent, error: e.message };
        // Sunucu mesajı reddetti (ör. boş mesaj): tekrar denemek işe yaramaz, kutudan çıkar.
      }
      await writeOutbox((await readOutbox()).filter((x) => x.id !== item.id));
      if (item.image && Platform.OS !== 'web') await FileSystem.deleteAsync(item.image, { idempotent: true }).catch(() => {});
      sent += 1;
    }
    return { sent, error: null };
  } finally {
    flushing = false;
  }
}
