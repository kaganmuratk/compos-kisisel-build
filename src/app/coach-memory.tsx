import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { coachFetch, useCoachConfig } from '@/lib/coach-client';
import { TextInput } from '@/components/text-input';
import { KEYBOARD_BAR_CLEARANCE } from '@/components/keyboard-done-bar';

type Palette = ReturnType<typeof useNutritionPalette>;
type Fact = { key: string; value: string; category: string; updated_at: string };
type Event = { id: string; title: string; kind: string; starts_at: string; ends_at: string | null; place: string | null };
type ClassRow = { id: string; weekday: number; start: string; end: string; title: string; place: string | null };
type AboutMe = { facts: Fact[]; events: Event[]; schedule: ClassRow[]; places: number; products: number };

const CATEGORY_LABELS: Record<string, string> = {
  profil: 'Profil', hedef: 'Hedefler', rutin: 'Rutinler', tercih: 'Tercihler', saglik: 'Sağlık',
  lojistik: 'Ulaşım ve yerler', genel: 'Genel',
};
const WEEKDAYS = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function confirmAction(title: string, message: string, onYes: () => void) {
  // Alert.alert() react-native-web'de çalışmıyor (bkz. nutrition/log/[id].tsx).
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: onYes },
  ]);
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Compos Kişisel: koçun Kağan hakkında kalıcı olarak kaydettiği her şey — görüp düzeltip silebilsin diye.
export default function CoachMemoryScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const config = useCoachConfig();
  const [data, setData] = useState<AboutMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setData(await coachFetch<AboutMe>(config, '/about-me'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [config]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const act = async (path: string, init: { method: string; body?: unknown }) => {
    if (!config) return;
    try {
      await coachFetch(config, path, init);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const groups = useMemo(() => {
    const out: Record<string, Fact[]> = {};
    for (const f of data?.facts ?? []) (out[f.category] ??= []).push(f);
    return Object.entries(out);
  }, [data]);

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader backHref="/coach" eyebrow="KOÇ" title="KOÇUN HAFIZASI" accentColor={palette.blue} />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        {!data && !error ? <ActivityIndicator style={styles.loading} color={palette.muted} /> : null}
        {data ? (
          <KeyboardAwareScrollView bottomOffset={KEYBOARD_BAR_CLEARANCE} contentContainerStyle={styles.content}>
            <ThemedText style={styles.intro}>
              Koçun senin hakkında kalıcı olarak kaydettikleri. Yanlış ya da eskimiş bir şey varsa düzelt ya da sil; sohbette
              "bunu unut" demek de aynı işi görür.
            </ThemedText>

            {groups.length === 0 ? <ThemedText style={styles.empty}>Henüz kayıtlı bilgi yok.</ThemedText> : null}
            {groups.map(([category, facts]) => (
              <View key={category} style={styles.section}>
                <ThemedText style={styles.label}>{(CATEGORY_LABELS[category] ?? category).toUpperCase()}</ThemedText>
                {facts.map((f) => (
                  <View key={f.key} style={styles.row}>
                    {editing === f.key ? (
                      <>
                        <TextInput value={draft} onChangeText={setDraft} multiline autoFocus style={styles.input} />
                        <View style={styles.actions}>
                          <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                            <ThemedText style={styles.secondaryAction}>Vazgeç</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={async () => {
                              await act('/memory', { method: 'POST', body: { key: f.key, value: draft.trim(), category: f.category } });
                              setEditing(null);
                            }}
                            disabled={!draft.trim()}
                            hitSlop={8}>
                            <ThemedText style={styles.primaryAction}>Kaydet</ThemedText>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        <ThemedText style={styles.value}>{f.value}</ThemedText>
                        <View style={styles.actions}>
                          <Pressable onPress={() => { setEditing(f.key); setDraft(f.value); }} hitSlop={8}>
                            <ThemedText style={styles.primaryAction}>Düzelt</ThemedText>
                          </Pressable>
                          <Pressable
                            onPress={() => confirmAction('Bilgiyi sil', f.value, () => act(`/memory/${encodeURIComponent(f.key)}`, { method: 'DELETE' }))}
                            hitSlop={8}>
                            <ThemedText style={styles.dangerAction}>Sil</ThemedText>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                ))}
              </View>
            ))}

            <View style={styles.section}>
              <ThemedText style={styles.label}>YAKLAŞAN PLANLAR</ThemedText>
              {data.events.length === 0 ? <ThemedText style={styles.empty}>Kayıtlı plan yok.</ThemedText> : null}
              {data.events.map((e) => (
                <View key={e.id} style={styles.row}>
                  <ThemedText style={styles.value}>{e.title}</ThemedText>
                  <ThemedText style={styles.meta}>
                    {formatWhen(e.starts_at)}{e.ends_at ? ` → ${formatWhen(e.ends_at)}` : ''}{e.place ? ` · ${e.place}` : ''}
                  </ThemedText>
                  <View style={styles.actions}>
                    <Pressable onPress={() => confirmAction('Planı iptal et', e.title, () => act(`/events/${e.id}`, { method: 'DELETE' }))} hitSlop={8}>
                      <ThemedText style={styles.dangerAction}>İptal et</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <ThemedText style={styles.label}>DERS PROGRAMI</ThemedText>
              {data.schedule.length === 0 ? <ThemedText style={styles.empty}>Ders programı girilmemiş; koça sohbette anlatabilirsin.</ThemedText> : null}
              {data.schedule.map((c) => (
                <View key={c.id} style={styles.row}>
                  <ThemedText style={styles.value}>{WEEKDAYS[c.weekday]} {c.start}–{c.end} · {c.title}</ThemedText>
                  {c.place ? <ThemedText style={styles.meta}>{c.place}</ThemedText> : null}
                  <View style={styles.actions}>
                    <Pressable onPress={() => confirmAction('Dersi kaldır', c.title, () => act(`/schedule/${c.id}`, { method: 'DELETE' }))} hitSlop={8}>
                      <ThemedText style={styles.dangerAction}>Kaldır</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            <ThemedText style={styles.footer}>
              Ayrıca {data.places} mekan ve {data.products} market/kafe ürünü kayıtlı. Bunları sohbette sorabilir, "artık yok" diyerek sildirebilirsin.
            </ThemedText>
          </KeyboardAwareScrollView>
        ) : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const createStyles = (palette: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: palette.background },
    safe: { flex: 1, paddingHorizontal: Spacing.three },
    loading: { marginTop: Spacing.six },
    content: { paddingBottom: Spacing.six, gap: Spacing.four },
    intro: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    error: { color: palette.red, fontSize: 13, paddingBottom: Spacing.two },
    section: { gap: Spacing.two },
    label: { fontFamily: Fonts.technicalBold, fontSize: 10, letterSpacing: 0.6, color: palette.muted },
    row: { ...cardShadowFor(palette), padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, gap: Spacing.one },
    value: { color: palette.text, fontSize: 15, lineHeight: 21 },
    meta: { color: palette.muted, fontSize: 12, fontFamily: Fonts.technical },
    empty: { color: palette.muted, fontSize: 13 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.four, marginTop: Spacing.one },
    primaryAction: { fontFamily: Fonts.bold, color: palette.blue, fontSize: 13 },
    secondaryAction: { fontFamily: Fonts.bold, color: palette.muted, fontSize: 13 },
    dangerAction: { fontFamily: Fonts.bold, color: palette.red, fontSize: 13 },
    input: { minHeight: 48, padding: Spacing.two, fontFamily: Fonts.medium, fontSize: 15, color: palette.text, backgroundColor: palette.raised, borderWidth: 1, borderColor: palette.border },
    footer: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  });
