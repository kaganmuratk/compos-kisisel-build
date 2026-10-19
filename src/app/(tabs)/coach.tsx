import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { ThemedView } from '@/components/themed-view';
import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { findTodaySessionForDay, useStartCoachSession } from '@/db/queries/coach-workout';
import { markCoachSeen, setupCoachNotifications } from '@/lib/coach-notifications';
import { CoachConfig, CoachMessage, CoachTodaySession, OutboxItem, coachFetch, coachImageSource, flushOutbox, loadCoachConfig, loadOutbox, queueOutgoing, saveCoachConfig } from '@/lib/coach-client';

type Palette = ReturnType<typeof useNutritionPalette>;

const POLL_MS = 20000;

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'BUGÜN';
  if (d.toDateString() === yesterday.toDateString()) return 'DÜN';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' }).toUpperCase();
}

async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

export default function CoachScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [config, setConfig] = useState<CoachConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CoachMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [today, setToday] = useState<CoachTodaySession[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [delivering, setDelivering] = useState(false);
  const listRef = useRef<FlatList<CoachMessage>>(null);

  useEffect(() => {
    setupCoachNotifications().catch(() => {});
    loadCoachConfig().then((c) => {
      setConfig(c);
      setShowConfig(!c);
      setConfigLoaded(true);
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!config) return;
    // Önce giden kutusu: bağlantı yokken yazılanlar sırayla gider.
    const pendingOut = await loadOutbox();
    setOutbox(pendingOut);
    if (pendingOut.length) {
      setDelivering(true);
      const flushed = await flushOutbox(config).finally(() => setDelivering(false));
      setOutbox(await loadOutbox());
      if (flushed.error) {
        setError(flushed.error);
        return;
      }
    }
    try {
      const res = await coachFetch<{ messages: CoachMessage[] }>(config, '/messages');
      setMessages(res.messages);
      // Sohbette görünen koç mesajları için arka planda ayrıca bildirim gelmesin.
      markCoachSeen([...res.messages].reverse().find((m) => m.role === 'assistant')?.created_at);
      coachFetch<{ sessions: CoachTodaySession[] }>(config, '/plan/today').then((r) => setToday(r.sessions)).catch(() => {});
      setError(null);
      if (res.messages.some((m) => m.role === 'assistant' && !m.read_at)) {
        coachFetch(config, '/messages/read', { method: 'POST' }).catch(() => {});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [config]);

  // Ekran açıkken ve uygulama ön plandayken yeni (proaktif dahil) mesajları çek.
  useFocusEffect(
    useCallback(() => {
      refresh();
      const timer = setInterval(refresh, POLL_MS);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [refresh])
  );

  const send = async () => {
    const text = draft.trim();
    const image = attachment;
    if ((!text && !image) || !config || sending) return;
    setDraft('');
    setAttachment(null);
    setSending(true);
    setError(null);
    // Mesaj önce telefonda saklanır; sunucuya ulaşılamazsa kaybolmaz, bağlantı gelince otomatik gider.
    await queueOutgoing(text, image ?? undefined);
    setOutbox(await loadOutbox());
    try {
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const undo = async (message: CoachMessage) => {
    if (!config) return;
    const ids = message.islemler.map((a) => a.islem_id).filter((x): x is string => !!x).reverse();
    try {
      for (const id of ids) await coachFetch(config, '/undo', { method: 'POST', body: { action_id: id } });
      setUndone((s) => new Set(s).add(message.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const data = useMemo(() => {
    const unsent: CoachMessage[] = outbox.map((o) => ({
      id: o.id, created_at: o.created_at, role: 'user', content: o.text, source: 'app', read_at: null,
      kaynaklar: [], islemler: [], gonderilmedi: true, gorsel: !!o.image, localImage: o.image,
    }));
    return [...messages, ...unsent].reverse();
  }, [messages, outbox]);

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.brandRow}>
          <ThemedText style={styles.brand}>COMPOS</ThemedText>
          <ThemedText style={styles.area}>KOÇ</ThemedText>
        </View>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>K</ThemedText>
          </View>
          <View style={styles.headerCopy}>
            <ThemedText style={styles.name}>Koç</ThemedText>
            <ThemedText style={[styles.status, error ? { color: palette.red } : null]}>
              {error ? 'BAĞLANTI SORUNU' : config ? 'AI KOÇ' : 'KURULUM GEREKLİ'}
            </ThemedText>
          </View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push('/coach-week' as never)} accessibilityLabel="Haftalık plan" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path d="M5 6h14v14H5zM5 10h14M9 3v4M15 3v4" stroke={palette.muted} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            <Pressable onPress={() => router.push('/coach-memory' as never)} accessibilityLabel="Koçun hafızası" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={8} r={3.5} stroke={palette.muted} strokeWidth={1.8} />
                <Path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" stroke={palette.muted} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            </Pressable>
            <Pressable onPress={() => setShowConfig((v) => !v)} accessibilityLabel="Koç ayarları" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Circle cx={12} cy={12} r={3} stroke={palette.muted} strokeWidth={1.8} />
                <Path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6 17 7M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" stroke={palette.muted} strokeWidth={1.8} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
        </View>

        {configLoaded && showConfig ? (
          <CoachConfigCard
            palette={palette}
            initial={config}
            onSaved={(c) => {
              setConfig(c);
              setShowConfig(false);
            }}
          />
        ) : null}

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

        {today.map((session) => (
          <TodayWorkoutCard key={session.plan_session_id} session={session} palette={palette} />
        ))}

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}>
          <FlatList
            ref={listRef}
            data={data}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              config ? (
                <View style={styles.empty}>
                  <ThemedText style={styles.emptyText}>
                    {'"100 ml su içtim", "öğlen yemekhanede döner yedim", "bu gece konuk evindeyim, akşam ne yiyeyim?" gibi yazabilirsin.'}
                  </ThemedText>
                </View>
              ) : null
            }
            ListHeaderComponent={sending ? (
              <View style={[styles.bubble, styles.assistant, styles.thinking]}>
                <ActivityIndicator size="small" color={palette.muted} />
                <ThemedText style={styles.meta}>Koç düşünüyor…</ThemedText>
              </View>
            ) : null}
            renderItem={({ item, index }) => {
              // Liste ters çevrili: bir üstteki (daha eski) mesaj başka günse bu mesajın üstüne gün ayıracı.
              const older = data[index + 1];
              const showDay = !older || dayKey(older.created_at) !== dayKey(item.created_at);
              return (
                <View>
                  {showDay ? (
                    <View style={styles.dayChip}>
                      <ThemedText style={styles.dayChipText}>{dayLabel(item.created_at)}</ThemedText>
                    </View>
                  ) : null}
                  <MessageBubble
                    message={item}
                    palette={palette}
                    config={config}
                    undone={undone.has(item.id)}
                    delivering={delivering}
                    onUndo={() => undo(item)}
                    onOpenImage={() => setViewing(item)}
                  />
                </View>
              );
            }}
          />
          {attachment ? (
            <View style={styles.attachmentRow}>
              <Image source={{ uri: attachment }} style={styles.attachmentThumb} />
              <ThemedText style={styles.attachmentText}>Görsel eklendi</ThemedText>
              <Pressable onPress={() => setAttachment(null)} hitSlop={8} accessibilityLabel="Görseli kaldır">
                <ThemedText style={styles.undo}>KALDIR</ThemedText>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.composer}>
            <Pressable
              onPress={() => {
                const choose = (source: 'camera' | 'library') => pickImage(source).then((uri) => uri && setAttachment(uri)).catch(() => {});
                // Alert.alert() react-native-web'de çalışmıyor: web'de doğrudan galeri.
                if (Platform.OS === 'web') return choose('library');
                Alert.alert('Görsel ekle', undefined, [
                  { text: 'Kamera', onPress: () => choose('camera') },
                  { text: 'Galeri', onPress: () => choose('library') },
                  { text: 'Vazgeç', style: 'cancel' },
                ]);
              }}
              disabled={!config}
              accessibilityLabel="Görsel ekle"
              style={({ pressed }) => [styles.attach, !config && styles.sendDisabled, pressed && styles.pressed]}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                <Path d="M4 7h3l2-2h6l2 2h3v12H4z" stroke={palette.muted} strokeWidth={1.8} strokeLinejoin="round" />
                <Circle cx={12} cy={13} r={3.5} stroke={palette.muted} strokeWidth={1.8} />
              </Svg>
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={config ? 'Mesaj' : 'Önce sunucuyu ayarla'}
              placeholderTextColor={palette.muted}
              editable={!!config}
              multiline
              style={styles.input}
            />
            <Pressable
              onPress={send}
              disabled={(!draft.trim() && !attachment) || sending || !config}
              accessibilityLabel="Gönder"
              style={({ pressed }) => [styles.send, ((!draft.trim() && !attachment) || sending || !config) && styles.sendDisabled, pressed && styles.pressed]}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="M5 12h14M13 6l6 6-6 6" stroke={palette.background} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewing(null)} accessibilityLabel="Görseli kapat">
          {viewing && config ? (
            <Image
              source={viewing.localImage ? { uri: viewing.localImage } : coachImageSource(config, viewing.id)}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function MessageBubble({ message, palette, config, undone, delivering, onUndo, onOpenImage }: {
  message: CoachMessage;
  palette: Palette;
  config: CoachConfig | null;
  undone: boolean;
  delivering: boolean;
  onUndo: () => void;
  onOpenImage: () => void;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const mine = message.role === 'user';
  const time = new Date(message.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[styles.bubble, mine ? styles.user : styles.assistant]}>
      {message.source === 'proactive' ? <ThemedText style={styles.badge}>KOÇ YAZDI</ThemedText> : null}
      {message.gorsel && config ? (
        <Pressable onPress={onOpenImage} accessibilityLabel="Görseli büyüt">
          <Image source={message.localImage ? { uri: message.localImage } : coachImageSource(config, message.id)} style={styles.bubbleImage} />
        </Pressable>
      ) : null}
      {message.content ? <ThemedText style={styles.body}>{message.content}</ThemedText> : null}
      {message.gonderilmedi ? (
        <ThemedText style={styles.meta}>{delivering ? 'Gönderiliyor…' : 'Gönderilmedi · bağlantı gelince otomatik gidecek'}</ThemedText>
      ) : message.bekliyor ? (
        <ThemedText style={styles.meta}>Bekliyor · koç kota/bağlantı dönünce cevaplayacak</ThemedText>
      ) : null}
      {message.kaynaklar.length > 0 ? (
        <ThemedText style={styles.meta}>Kaynak: {message.kaynaklar.map((k) => k.etiket).join(' · ')}</ThemedText>
      ) : null}
      <View style={styles.metaRow}>
        <ThemedText style={styles.meta}>{time}</ThemedText>
        {message.islemler.length > 0 ? (
          undone ? (
            <ThemedText style={styles.meta}>Geri alındı</ThemedText>
          ) : (
            <Pressable onPress={onUndo} hitSlop={10} accessibilityLabel="Bu mesajdaki kayıtları geri al">
              <ThemedText style={styles.undo}>{message.islemler.length} kayıt · Geri al</ThemedText>
            </Pressable>
          )
        ) : null}
      </View>
    </View>
  );
}

function TodayWorkoutCard({ session, palette }: { session: CoachTodaySession; palette: Palette }) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const start = useStartCoachSession();
  const [existing, setExisting] = useState<{ id: string; finished: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dayId = session.program_day_id;

  useFocusEffect(
    useCallback(() => {
      if (!dayId) return;
      findTodaySessionForDay(dayId).then((s) => setExisting(s ? { id: s.id, finished: !!s.finishedAt } : null));
    }, [dayId])
  );

  const totalSets = session.hareketler.reduce((sum, h) => sum + h.set, 0);
  const done = session.durum === 'yapildi' || existing?.finished;
  const open = async () => {
    if (!dayId) return;
    setMessage(null);
    if (existing) {
      router.push({ pathname: '/workout/[sessionId]', params: { sessionId: existing.id } });
      return;
    }
    try {
      const created = await start.mutateAsync({ dayId, name: session.ad });
      router.push({ pathname: '/workout/[sessionId]', params: { sessionId: created.id } });
    } catch (e) {
      setMessage((e as Error).message === 'PLAN_DAY_NOT_SYNCED'
        ? 'Plan henüz telefona inmedi. Birkaç saniye sonra tekrar dene.'
        : (e as Error).message);
    }
  };

  return (
    <View style={styles.planCard}>
      <View style={styles.planCopy}>
        <ThemedText style={styles.label}>BUGÜNÜN ANTRENMANI</ThemedText>
        <ThemedText style={styles.planTitle}>{session.ad}</ThemedText>
        <ThemedText style={styles.meta}>
          {session.hareketler.length} hareket · {totalSets} set{session.durum === 'atlandi' ? ' · atlandı' : ''}
        </ThemedText>
        {message ? <ThemedText style={styles.planError}>{message}</ThemedText> : null}
      </View>
      {dayId && session.durum !== 'atlandi' ? (
        <Pressable onPress={open} disabled={start.isPending} style={({ pressed }) => [styles.planButton, done && styles.planButtonDone, pressed && styles.pressed]}>
          {start.isPending ? <ActivityIndicator color={palette.background} /> : (
            <ThemedText style={[styles.planButtonText, done && { color: palette.text }]}>
              {done ? 'Yapıldı ✓' : existing ? 'Devam et' : 'Başlat'}
            </ThemedText>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

function CoachConfigCard({ palette, initial, onSaved }: { palette: Palette; initial: CoachConfig | null; onSaved: (c: CoachConfig) => void }) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [url, setUrl] = useState(initial?.url ?? '');
  const [key, setKey] = useState(initial?.key ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setStatus(null);
    // Yapıştırırken başa çift 'http://' gelirse temizle.
    const candidate = { url: url.trim().replace(/^(https?:\/\/)+/i, (m) => m.slice(0, m.indexOf('//') + 2)).replace(/\/+$/, ''), key: key.trim() };
    try {
      const s = await coachFetch<{ chatgpt: string; supabase: string; kitap_parcasi: number }>(candidate, '/status');
      await saveCoachConfig(candidate);
      setStatus(`Bağlandı · ChatGPT: ${s.chatgpt} · Kitap parçası: ${s.kitap_parcasi}`);
      onSaved(candidate);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.configCard}>
      <ThemedText style={styles.label}>SUNUCU ADRESİ</ThemedText>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholder="http://192.168.1.20:8787" placeholderTextColor={palette.muted} style={styles.field} />
      <ThemedText style={styles.label}>ANAHTAR</ThemedText>
      <TextInput value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="setup komutunun verdiği anahtar" placeholderTextColor={palette.muted} style={styles.field} />
      <Pressable onPress={test} disabled={busy} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
        {busy ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.saveText}>Bağlan ve kaydet</ThemedText>}
      </Pressable>
      {status ? <ThemedText style={styles.meta}>{status}</ThemedText> : null}
    </View>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: palette.background },
    safe: { flex: 1, paddingHorizontal: Spacing.three },
    flex: { flex: 1 },
    brandRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.border },
    brand: { color: palette.text, fontFamily: Fonts.metric, fontSize: 18, letterSpacing: 2 },
    area: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 1.2 },
    header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: 1, borderColor: palette.border },
    avatar: { width: 40, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(palette.blue, 0.18) },
    avatarText: { color: palette.blue, fontFamily: Fonts.metric, fontSize: 20, lineHeight: 24 },
    headerCopy: { flex: 1 },
    name: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 22, lineHeight: 25 },
    status: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
    headerActions: { flexDirection: 'row', gap: Spacing.one },
    // hitSlop YOK: yan yana 44'lük butonlarda hitSlop dokunma alanlarını üst üste bindirip yanlış sayfayı açıyordu.
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.72 },
    error: { color: palette.red, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5, paddingBottom: Spacing.two },
    list: { paddingVertical: Spacing.three, gap: Spacing.two, flexGrow: 1 },
    empty: { flex: 1, justifyContent: 'center', paddingVertical: Spacing.six },
    emptyText: { color: palette.muted, fontFamily: Fonts.medium, fontSize: 14, lineHeight: 21, textAlign: 'center' },
    // Sohbet balonları: diğer ekranlardaki köşeli kartların aksine yuvarlak, gönderen tarafındaki alt köşe sivri.
    bubble: { maxWidth: '84%', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: 6, gap: 4, borderRadius: 18 },
    user: { alignSelf: 'flex-end', borderBottomRightRadius: 4, backgroundColor: withAlpha(palette.blue, 0.2) },
    assistant: { ...cardShadowFor(palette), alignSelf: 'flex-start', borderBottomLeftRadius: 4, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
    bubbleImage: { width: 220, height: 220, borderRadius: 12, marginTop: 2, backgroundColor: palette.raised },
    dayChip: { alignSelf: 'center', paddingHorizontal: Spacing.two, paddingVertical: 4, marginVertical: Spacing.two, borderRadius: Radius.full, backgroundColor: palette.raised },
    dayChipText: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.8 },
    thinking: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    body: { color: palette.text, fontFamily: Fonts.medium, fontSize: 15, lineHeight: 22 },
    badge: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
    meta: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5 },
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.three },
    undo: { color: palette.blue, fontFamily: Fonts.technicalBold, fontSize: 9, letterSpacing: 0.5 },
    composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one, paddingVertical: Spacing.two, backgroundColor: palette.background },
    attach: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
    input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: Spacing.three, paddingTop: 11, paddingBottom: 11, fontFamily: Fonts.medium, fontSize: 15, color: palette.text, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
    send: { width: 44, height: 44, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
    attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.two },
    attachmentThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: palette.raised },
    attachmentText: { flex: 1, color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5 },
    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    sendDisabled: { opacity: 0.45 },
    planCard: { ...cardShadowFor(palette), flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginBottom: Spacing.two, padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
    planCopy: { flex: 1, gap: 2 },
    planTitle: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 21, lineHeight: 24 },
    planError: { color: palette.red, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
    planButton: { minHeight: 44, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
    planButtonDone: { backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border },
    planButtonText: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
    configCard: { ...cardShadowFor(palette), marginBottom: Spacing.two, padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, gap: Spacing.two },
    label: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, lineHeight: 13, letterSpacing: 1.1 },
    field: { minHeight: 48, paddingHorizontal: Spacing.three, fontFamily: Fonts.medium, fontSize: 15, color: palette.text, backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border },
    saveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, marginTop: Spacing.one },
    saveText: { color: palette.background, fontFamily: Fonts.bold, fontSize: 14, letterSpacing: 0.7 },
  });
