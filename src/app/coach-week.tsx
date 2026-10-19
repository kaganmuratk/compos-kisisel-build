import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, cardShadowFor, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { coachFetch, useCoachConfig, type CoachPlanSet } from '@/lib/coach-client';
import { addDaysToDateString, getTodayDateString } from '@/lib/date';

type Palette = ReturnType<typeof useNutritionPalette>;
type Session = {
  id: string;
  tarih: string;
  gun: string;
  ad: string;
  durum: 'planli' | 'yapildi' | 'atlandi';
  not: string | null;
  hareketler: { hareket: string; setler: CoachPlanSet[]; not?: string | null }[];
  karsilastirma?: { hareketler: { hareket: string; farklar: string[] }[]; plan_disi_hareketler: string[] };
};
type Week = {
  plan_id: string | null;
  hafta: string;
  durum?: 'taslak' | 'aktif' | 'arsiv';
  baslik?: string | null;
  gerekce?: string | null;
  beslenme?: {
    gunluk?: { kcal?: number; protein_g?: number; karb_g?: number; yag_g?: number };
    notlar?: string;
    gun_notlari?: { date: string; not: string }[];
  } | null;
  seanslar?: Session[];
  degisiklikler?: { created_at: string; reason: string; summary: string }[];
};

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const STATUS: Record<Session['durum'], string> = { planli: 'PLANLI', yapildi: 'YAPILDI ✓', atlandi: 'ATLANDI' };

function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return addDaysToDateString(date, -((d.getDay() + 6) % 7));
}

function setsText(sets: CoachPlanSet[]) {
  // Aynı hedefli ardışık setleri grupla: "3×8 @ 80 kg RIR 2"
  const groups: { n: number; s: CoachPlanSet }[] = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.s.kg === s.kg && last.s.reps === s.reps && last.s.rir === s.rir) last.n += 1;
    else groups.push({ n: 1, s });
  }
  return groups
    .map(({ n, s }) => `${n}×${s.reps ?? '?'}${s.kg != null ? ` @ ${s.kg} kg` : ''}${s.rir != null ? ` RIR ${s.rir}` : ''}`)
    .join(' · ');
}

// Compos Kişisel: koçun haftalık planı gün gün — ileri günler, yapılanlar, plan-yapılan farkları, değişiklikler.
export default function CoachWeekScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const config = useCoachConfig();
  const today = getTodayDateString();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [week, setWeek] = useState<Week | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) return;
    try {
      setWeek(await coachFetch<Week>(config, `/plan/week?date=${weekStart}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [config, weekStart]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToDateString(weekStart, i)), [weekStart]);
  const dayNotes = useMemo(
    () => Object.fromEntries((week?.beslenme?.gun_notlari ?? []).map((n) => [n.date, n.not])),
    [week]
  );
  const goal = week?.beslenme?.gunluk;

  return (
    <ThemedView style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader backHref="/coach" eyebrow="KOÇ" title="HAFTALIK PLAN" accentColor={palette.blue} />
        <View style={styles.weekNav}>
          <Pressable onPress={() => setWeekStart((w) => addDaysToDateString(w, -7))} hitSlop={10}>
            <ThemedText style={styles.navArrow}>‹</ThemedText>
          </Pressable>
          <ThemedText style={styles.weekLabel}>
            {new Date(`${weekStart}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} –{' '}
            {new Date(`${addDaysToDateString(weekStart, 6)}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </ThemedText>
          <Pressable onPress={() => setWeekStart((w) => addDaysToDateString(w, 7))} hitSlop={10}>
            <ThemedText style={styles.navArrow}>›</ThemedText>
          </Pressable>
        </View>
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        {!week && !error ? <ActivityIndicator style={styles.loading} color={palette.muted} /> : null}
        {week && !week.plan_id ? (
          <ThemedText style={styles.empty}>Bu hafta için plan yok. Koça "bu hafta için plan yap" diyebilirsin.</ThemedText>
        ) : null}
        {week?.plan_id ? (
          <ScrollView contentContainerStyle={styles.content}>
            {week.durum === 'taslak' ? (
              <View style={styles.draftBanner}>
                <ThemedText style={styles.draftText}>TASLAK · koç onayını bekliyor. Sohbette onaylarsan Compos'a yazılır.</ThemedText>
              </View>
            ) : null}
            {week.baslik ? <ThemedText style={styles.title}>{week.baslik}</ThemedText> : null}
            {goal ? (
              <ThemedText style={styles.goal}>
                Günlük hedef: {goal.kcal ?? '–'} kcal · {goal.protein_g ?? '–'} g protein · {goal.karb_g ?? '–'} g karb · {goal.yag_g ?? '–'} g yağ
              </ThemedText>
            ) : null}
            {week.beslenme?.notlar ? <ThemedText style={styles.note}>{week.beslenme.notlar}</ThemedText> : null}

            {days.map((date, i) => {
              const sessions = (week.seanslar ?? []).filter((s) => s.tarih === date);
              const isToday = date === today;
              return (
                <View key={date} style={[styles.day, isToday && styles.today]}>
                  <ThemedText style={styles.dayLabel}>
                    {DAY_NAMES[i].toUpperCase()} · {new Date(`${date}T00:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    {isToday ? ' · BUGÜN' : ''}
                  </ThemedText>
                  {sessions.length === 0 ? <ThemedText style={styles.rest}>Antrenman yok</ThemedText> : null}
                  {sessions.map((s) => (
                    <View key={s.id} style={styles.session}>
                      <View style={styles.sessionHead}>
                        <ThemedText style={styles.sessionName}>{s.ad}</ThemedText>
                        <ThemedText style={[styles.status, s.durum === 'yapildi' && { color: palette.green }, s.durum === 'atlandi' && { color: palette.red }]}>
                          {STATUS[s.durum]}
                        </ThemedText>
                      </View>
                      {s.hareketler.map((h) => (
                        <ThemedText key={h.hareket} style={styles.exercise}>
                          {h.hareket}: <ThemedText style={styles.sets}>{setsText(h.setler)}</ThemedText>
                        </ThemedText>
                      ))}
                      {s.not ? <ThemedText style={styles.note}>{s.not}</ThemedText> : null}
                      {s.karsilastirma ? (
                        <View style={styles.compare}>
                          <ThemedText style={styles.compareLabel}>PLAN / YAPILAN</ThemedText>
                          {s.karsilastirma.hareketler.map((h) => (
                            <ThemedText key={h.hareket} style={styles.note}>
                              {h.hareket}: {h.farklar.join(', ')}
                            </ThemedText>
                          ))}
                          {s.karsilastirma.plan_disi_hareketler.length ? (
                            <ThemedText style={styles.note}>Plan dışı: {s.karsilastirma.plan_disi_hareketler.join(', ')}</ThemedText>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                  {dayNotes[date] ? <ThemedText style={styles.dayNote}>Beslenme: {dayNotes[date]}</ThemedText> : null}
                </View>
              );
            })}

            {week.gerekce ? (
              <View style={styles.section}>
                <ThemedText style={styles.compareLabel}>KOÇUN GEREKÇESİ</ThemedText>
                <ThemedText style={styles.note}>{week.gerekce}</ThemedText>
              </View>
            ) : null}
            {week.degisiklikler?.length ? (
              <View style={styles.section}>
                <ThemedText style={styles.compareLabel}>DEĞİŞİKLİKLER</ThemedText>
                {week.degisiklikler.map((c) => (
                  <ThemedText key={c.created_at + c.summary} style={styles.note}>
                    {new Date(c.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}: {c.summary} — {c.reason}
                  </ThemedText>
                ))}
              </View>
            ) : null}
          </ScrollView>
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
    weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four, paddingBottom: Spacing.two },
    navArrow: { fontFamily: Fonts.technical, fontSize: 18, color: palette.blue, paddingHorizontal: Spacing.two },
    weekLabel: { fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 0.7, color: palette.text, minWidth: 140, textAlign: 'center' },
    content: { paddingBottom: Spacing.six, gap: Spacing.three },
    error: { color: palette.red, fontSize: 13 },
    empty: { color: palette.muted, fontSize: 14, lineHeight: 21, paddingTop: Spacing.four },
    draftBanner: { padding: Spacing.two, borderWidth: 1, borderColor: palette.blue },
    draftText: { color: palette.blue, fontSize: 10, letterSpacing: 0.5, lineHeight: 15, fontFamily: Fonts.technicalBold },
    title: { fontFamily: Fonts.metricMedium, fontSize: 21, lineHeight: 24, color: palette.text },
    goal: { fontSize: 13, color: palette.text, fontFamily: Fonts.technical },
    day: { ...cardShadowFor(palette), padding: Spacing.three, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, gap: Spacing.two },
    today: { borderColor: palette.blue, borderWidth: 1 },
    dayLabel: { fontFamily: Fonts.technicalBold, fontSize: 11, letterSpacing: 0.6, color: palette.muted },
    rest: { color: palette.muted, fontSize: 13 },
    session: { gap: 4 },
    sessionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sessionName: { fontFamily: Fonts.metricMedium, fontSize: 19, lineHeight: 22, color: palette.text },
    status: { fontFamily: Fonts.technicalBold, fontSize: 10, color: palette.muted },
    exercise: { fontSize: 13, color: palette.text, lineHeight: 19 },
    sets: { fontSize: 13, color: palette.muted, fontFamily: Fonts.technical },
    compare: { marginTop: Spacing.one, gap: 2 },
    compareLabel: { fontFamily: Fonts.technicalBold, fontSize: 10, letterSpacing: 0.6, color: palette.muted },
    note: { fontSize: 12, color: palette.muted, lineHeight: 18 },
    dayNote: { fontSize: 12, color: palette.text, lineHeight: 18 },
    section: { gap: Spacing.one },
  });
