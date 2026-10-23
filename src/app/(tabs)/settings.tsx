import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Appearance, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { desc, isNotNull } from 'drizzle-orm';

import { ThemedView } from '@/components/themed-view';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { Fonts, Radius, Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { powerSyncDb } from '@/db/powersync';
import { useSettings, useUpdateSettings } from '@/db/queries/settings';
import { useHistoryDays } from '@/db/queries/history-days';
import { cardioSessions, foods, nutritionLogs } from '@/db/schema';
import { useAuth } from '@/hooks/use-auth';
import { useConnectHealthConnect, useHealthConnectStatus } from '@/hooks/use-health-connect';
import { alertMessage } from '@/lib/alert';
import { addMinutesToTime, getTodayDateString } from '@/lib/date';
import { friendlyErrorMessage } from '@/lib/errors';
import { createHistoryCsv, writeHistoryCsv } from '@/lib/export-csv';
import { openHealthConnectSettings, queryRawSampleCounts } from '@/lib/health-connect';
import { shareOrDownloadImage } from '@/lib/share-image';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('İşlem zaman aşımına uğradı.')), ms)),
  ]);
}

export default function SettingsScreen() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const { data: settings } = useSettings();
  const { t, language } = useT();
  const updateSettings = useUpdateSettings();
  const { user } = useAuth();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const historyDays = useHistoryDays();
  const [exportScope, setExportScope] = useState<'day' | 'range' | 'all' | null>(null);
  const [exportDate, setExportDate] = useState(getTodayDateString());
  const [exportStartDate, setExportStartDate] = useState(getTodayDateString());
  const [exportEndDate, setExportEndDate] = useState(getTodayDateString());
  const [exporting, setExporting] = useState(false);

  const cardStyle = [styles.card];

  const checkForUpdate = async () => {
    setCheckingUpdate(true);
    try {
      // checkForUpdateAsync()/fetchUpdateAsync() have no built-in timeout —
      // on a slow/flaky connection they can hang indefinitely, leaving the
      // spinner stuck until the app is force-quit. Race each against a
      // timeout so the button always resolves back to a usable state.
      const result = await withTimeout(Updates.checkForUpdateAsync(), 15000);
      if (!result.isAvailable) {
        alertMessage(t('upToDate'), t('upToDateMessage'));
        return;
      }
      await withTimeout(Updates.fetchUpdateAsync(), 30000);
      alertMessage(t('updateDownloaded'), t('updateDownloadedMessage'), () => Updates.reloadAsync());
    } catch (error) {
      alertMessage(t('checkFailed'), friendlyErrorMessage(error, t('checkFailedMessage')));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const exportData = async () => {
    if (!exportScope) return;
    const startDate = exportScope === 'day' ? exportDate : exportScope === 'range' ? exportStartDate : undefined;
    const endDate = exportScope === 'day' ? exportDate : exportScope === 'range' ? exportEndDate : undefined;
    if (startDate && endDate && startDate > endDate) {
      alertMessage(t('invalidDateRange'), t('invalidDateRangeMessage'));
      return;
    }
    setExporting(true);
    try {
      const csv = createHistoryCsv(historyDays, startDate, endDate);
      const fileName = `compos-verileri-${startDate ?? 'tumu'}-${endDate ?? 'tumu'}.csv`;
      const uri = Platform.OS === 'web'
        ? `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`
        : await writeHistoryCsv(csv, fileName);
      await shareOrDownloadImage(uri, fileName, { mimeType: 'text/csv', dialogTitle: t('exportDialogTitle') });
      setExportScope(null);
    } catch (error) {
      alertMessage(t('exportFailed'), friendlyErrorMessage(error, t('exportFailedMessage')));
    } finally {
      setExporting(false);
    }
  };

  if (!settings) {
    return null;
  }

  return (
    <ThemedView lightColor={theme.background} darkColor={theme.background} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.brandRow}>
          <ThemedText style={styles.wordmark}>COMPOS</ThemedText>
          <ThemedText style={styles.areaLabel}>{t('settings').toUpperCase()}</ThemedText>
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeading}>
          <ThemedText style={styles.subtitle}>{t('yourDefaults').toUpperCase()}</ThemedText>
          <ThemedText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.title}>{t('settings').toUpperCase()}</ThemedText>
        </View>
        <SyncWarningBanner />
        <SyncStatusCard cardStyle={cardStyle} />
        <Pressable onPress={() => router.push('/account')} style={[cardStyle, styles.accountRow]}>
          <View style={styles.accountText}>
            <ThemedText style={styles.sectionLabel}>{t('account').toUpperCase()}</ThemedText>
            <ThemedText type="small">{user ? user.email : 'NOT SIGNED IN'}</ThemedText>
          </View>
          <ThemedText style={styles.accountAction}>{t('manage').toUpperCase()} ›</ThemedText>
        </Pressable>

        <ThemedText style={styles.sectionLabel}>{t('goalsAndDefaults').toUpperCase()}</ThemedText>
        <View style={cardStyle}>
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('water').toUpperCase()}</ThemedText>
            <GoalStepper value={settings.waterGoalMl} unit="ml" step={250} min={250} onChange={(next) => updateSettings.mutate({ waterGoalMl: next })} />
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('calorieTarget').toUpperCase()}</ThemedText>
            <GoalStepper value={settings.calorieGoal} unit="kcal" step={100} min={500} onChange={(next) => updateSettings.mutate({ calorieGoal: next })} />
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('macroTargets').toUpperCase()}</ThemedText>
            <MacroGoalsRow proteinGoal={settings.proteinGoal} carbsGoal={settings.carbsGoal} fatGoal={settings.fatGoal} onSave={(values) => updateSettings.mutate(values)} />
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
          <ThemedText style={styles.cardTitle}>{t('weightUnit').toUpperCase()}</ThemedText>
          <View style={styles.chipRow}>
            {(['kg', 'lb'] as const).map((unit) => {
              const selected = settings.unit === unit;
              return (
                <Pressable
                  key={unit}
                  onPress={() => updateSettings.mutate({ unit })}
                  style={[styles.chip, selected && styles.chipSelected]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>
                    {unit.toUpperCase()}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
          <ThemedText style={styles.cardTitle}>{t('effortMetric').toUpperCase()}</ThemedText>
          <View style={styles.chipRow}>
            {(['rir', 'rpe'] as const).map((metric) => {
              const selected = settings.repMetric === metric;
              return <Pressable key={metric} onPress={() => updateSettings.mutate({ repMetric: metric })} style={[styles.chip, selected && styles.chipSelected]}><ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>{metric.toUpperCase()}</ThemedText></Pressable>;
            })}
          </View>
          <RepMetricDefaultValueRow repMetric={settings.repMetric} value={settings.defaultRepMetricValue} onChange={(value) => updateSettings.mutate({ defaultRepMetricValue: value })} />
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('sleepDefaults').toUpperCase()}</ThemedText>
            <View style={styles.timeStepperRow}><ThemedText type="small" themeColor="textSecondary">{t('bedtime').toUpperCase()}</ThemedText><TimeStepper value={settings.defaultBedTime ?? '23:00'} onChange={(next) => updateSettings.mutate({ defaultBedTime: next })} /></View>
            <View style={styles.timeStepperRow}><ThemedText type="small" themeColor="textSecondary">{t('wakeUp').toUpperCase()}</ThemedText><TimeStepper value={settings.defaultWakeTime ?? '07:00'} onChange={(next) => updateSettings.mutate({ defaultWakeTime: next })} /></View>
          </View>
        </View>

        <ThemedText style={styles.sectionLabel}>{t('app').toUpperCase()}</ThemedText>
        <View style={cardStyle}>
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('cloudMediaBackupLabel').toUpperCase()}</ThemedText>
            <View style={styles.chipRow}>
              <Pressable onPress={() => updateSettings.mutate({ mediaCloudBackup: true })} style={[styles.chip, settings.mediaCloudBackup && styles.chipSelected]}><ThemedText type="smallBold" style={{ color: settings.mediaCloudBackup ? theme.accentOn : theme.text }}>{t('backUpToCloudLabel').toUpperCase()}</ThemedText></Pressable>
              <Pressable onPress={() => updateSettings.mutate({ mediaCloudBackup: false })} style={[styles.chip, !settings.mediaCloudBackup && styles.chipSelected]}><ThemedText type="smallBold" style={{ color: !settings.mediaCloudBackup ? theme.accentOn : theme.text }}>{t('noKeepOnDevice').toUpperCase()}</ThemedText></Pressable>
            </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
          <ThemedText style={styles.cardTitle}>{t('appearance').toUpperCase()}</ThemedText>
          <View style={styles.chipRow}>
            {([['system', t('system').toUpperCase()], ['light', t('light').toUpperCase()], ['dark', t('dark').toUpperCase()]] as const).map(([mode, label]) => {
              const selected = (settings.themeMode ?? 'system') === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => {
                    // react-native-web has no Appearance.setColorScheme (it only
                    // mirrors the OS/browser prefers-color-scheme) — calling it
                    // there threw and aborted this handler before the mutate
                    // below ever ran, so picking a theme on web silently did
                    // nothing (the settings.themeMode row never got saved).
                    if (Platform.OS !== 'web') {
                      Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
                    }
                    updateSettings.mutate({ themeMode: mode });
                  }}
                  style={[styles.chip, selected && styles.chipSelected]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>{label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
            <ThemedText style={styles.cardTitle}>{t('language').toUpperCase()}</ThemedText>
            <View style={styles.chipRow}>
              {(['en', 'tr'] as const).map((language) => { const selected = settings.language === language; return <Pressable key={language} onPress={() => updateSettings.mutate({ language })} style={[styles.chip, selected && styles.chipSelected]}><ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>{language === 'en' ? 'EN' : 'TR'}</ThemedText></Pressable>; })}
            </View>
          </View>
        </View>

        <ThemedText style={styles.sectionLabel}>{t('dataAndDevices').toUpperCase()}</ThemedText>
        <View style={cardStyle}>
          <View style={styles.settingBlock}>
          <ThemedText style={styles.cardTitle}>{t('exportData').toUpperCase()}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{t('downloadHistoryHint')}</ThemedText>
          <Pressable
            onPress={() => setExportScope((scope) => scope ? null : 'all')}
            style={[styles.checkUpdateButton, { backgroundColor: theme.backgroundSelected, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>{t('exportData')}</ThemedText>
          </Pressable>
          {exportScope && <View style={styles.exportOptions}>
            <View style={styles.chipRow}>
              {([['day', t('singleDay').toUpperCase()], ['range', t('dateRange').toUpperCase()], ['all', t('all').toUpperCase()]] as const).map(([scope, label]) => {
                const selected = exportScope === scope;
                return <Pressable key={scope} onPress={() => setExportScope(scope)} style={[styles.chip, selected && styles.chipSelected]}><ThemedText type="smallBold" style={{ color: selected ? theme.accentOn : theme.text }}>{label}</ThemedText></Pressable>;
              })}
            </View>
            {exportScope === 'day' && <TextInput value={exportDate} onChangeText={setExportDate} placeholder="YYYY-MM-DD" placeholderTextColor={theme.muted} style={styles.dateInput} />}
            {exportScope === 'range' && <View style={styles.exportDates}><TextInput value={exportStartDate} onChangeText={setExportStartDate} placeholder="Start" placeholderTextColor={theme.muted} style={[styles.dateInput, styles.exportDateInput]} /><TextInput value={exportEndDate} onChangeText={setExportEndDate} placeholder="End" placeholderTextColor={theme.muted} style={[styles.dateInput, styles.exportDateInput]} /></View>}
            <Pressable onPress={exportData} disabled={exporting} style={[styles.checkUpdateButton, { backgroundColor: theme.accent, opacity: exporting ? 0.7 : 1 }]}>
              {exporting ? <ActivityIndicator color={theme.accentOn} /> : <ThemedText type="smallBold" style={{ color: theme.accentOn }}>{t('generateCsv').toUpperCase()}</ThemedText>}
            </Pressable>
          </View>}
          </View>
          <View style={styles.rule} />
          <View style={styles.settingBlock}>
          <ThemedText style={styles.cardTitle}>{t('smartwatch').toUpperCase()}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('smartwatchNotAvailable')}
          </ThemedText>
          <Pressable
            onPress={() => alertMessage(t('comingSoon'), t('smartwatchComingSoonMessage'))}
            style={[styles.checkUpdateButton, { backgroundColor: theme.backgroundSelected, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
            <ThemedText type="smallBold" style={{ color: theme.text }}>
              {t('connectWatch')}
            </ThemedText>
          </Pressable>
          </View>
          {Platform.OS !== 'web' && (
            <>
              <View style={styles.rule} />
              <View style={styles.settingBlock}>
                <ThemedText style={styles.cardTitle}>
                  {t('version').toUpperCase()}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {Updates.isEmbeddedLaunch
                    ? t('embeddedBuildRunning')
                    : `${t('update')}: ${Updates.updateId?.slice(0, 8) ?? '–'} · ${Updates.createdAt ? new Date(Updates.createdAt).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US') : '–'}`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('channel')}: {Updates.channel ?? '–'} · {t('active')}: {Updates.isEnabled ? t('yes') : t('no')}
                </ThemedText>
                <Pressable
                  onPress={checkForUpdate}
                  disabled={checkingUpdate}
                  style={[styles.checkUpdateButton, { backgroundColor: theme.accent, opacity: checkingUpdate ? 0.7 : 1 }]}>
                  {checkingUpdate ? (
                    <ActivityIndicator color={theme.accentOn} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: theme.accentOn }}>
                      {t('checkForUpdates')}
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>

        {Platform.OS === 'android' && process.env.EXPO_PUBLIC_HIDE_HEALTH_CONNECT !== 'true' && (
          <HealthConnectCard cardStyle={cardStyle} />
        )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

// Stepper for a whole-number daily goal (water ml, calorie kcal) that's also
// tap-to-type: +/- moves it a fixed step, but tapping the value swaps in a
// keyboard so any exact number can be entered directly.
// Auto-fills this value into the RIR/RPE field of every newly created set
// (new exercises added during a workout, or sets generated from a program
// template) — never touches sets that already exist. Stored in
// `settings.defaultRepMetricValue`, synced like every other setting.
function RepMetricDefaultValueRow({
  repMetric,
  value,
  onChange,
}: {
  repMetric: 'rir' | 'rpe';
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useT();
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const [text, setText] = useState(value != null ? String(value) : '');

  useEffect(() => {
    setText(value != null ? String(value) : '');
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    const parsed = trimmed ? Number(trimmed.replace(',', '.')) : null;
    const next = parsed != null && Number.isFinite(parsed) ? parsed : null;
    onChange(next);
    setText(next != null ? String(next) : '');
  };

  return (
    <View style={styles.repMetricDefaultRow}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('defaultValue').toUpperCase()} {repMetric.toUpperCase()}
      </ThemedText>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        onBlur={commit}
        placeholder={t('off').toUpperCase()}
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.repMetricDefaultInput, { color: theme.text, borderColor: theme.border }]}
      />
    </View>
  );
}

function TimeStepper({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  return (
    <View style={styles.timeStepper}>
      <Pressable
        accessibilityLabel="Saati geri al"
        onPress={() => onChange(addMinutesToTime(value, -15))}
        hitSlop={10}
        style={styles.stepperButtonSmall}>
        <ThemedText style={styles.stepperSymbol}>−</ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={styles.timeStepperValue}>
        {value}
      </ThemedText>
      <Pressable
        accessibilityLabel="Saati ileri al"
        onPress={() => onChange(addMinutesToTime(value, 15))}
        hitSlop={10}
        style={styles.stepperButtonSmall}>
        <ThemedText style={styles.stepperSymbol}>+</ThemedText>
      </Pressable>
    </View>
  );
}

function GoalStepper({
  value,
  unit,
  step,
  min,
  onChange,
}: {
  value: number;
  unit: string;
  step: number;
  min: number;
  onChange: (next: number) => void;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(text.replace(',', '.'));
    onChange(Number.isFinite(parsed) ? Math.max(min, Math.round(parsed)) : value);
    setEditing(false);
  };

  return (
    <View style={styles.stepperRow}>
      <Pressable
        accessibilityLabel="Hedefi azalt"
        onPress={() => onChange(Math.max(min, value - step))}
        hitSlop={10}
        style={styles.stepperButton}>
        <ThemedText style={styles.stepperSymbol}>−</ThemedText>
      </Pressable>
      {editing ? (
        <TextInput
          value={text}
          onChangeText={setText}
          onEndEditing={commit}
          onBlur={commit}
          keyboardType="number-pad"
          autoFocus
          style={[styles.stepperInput, { color: theme.text, borderColor: theme.border }]}
        />
      ) : (
        <Pressable onPress={() => setEditing(true)} hitSlop={4}>
          <ThemedText type="title" style={styles.stepperValue}>
            {value} {unit}
          </ThemedText>
        </Pressable>
      )}
      <Pressable
        accessibilityLabel="Hedefi artır"
        onPress={() => onChange(value + step)}
        hitSlop={10}
        style={styles.stepperButton}>
        <ThemedText style={styles.stepperSymbol}>+</ThemedText>
      </Pressable>
    </View>
  );
}

function MacroGoalsRow({
  proteinGoal,
  carbsGoal,
  fatGoal,
  onSave,
}: {
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
  onSave: (values: { proteinGoal?: number; carbsGoal?: number; fatGoal?: number }) => void;
}) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const { t } = useT();
  const [protein, setProtein] = useState(String(proteinGoal));
  const [carbs, setCarbs] = useState(String(carbsGoal));
  const [fat, setFat] = useState(String(fatGoal));

  const inputStyle = [
    styles.macroInput,
    { color: theme.text, backgroundColor: theme.backgroundSelected, borderColor: theme.border },
  ];

  const saveProtein = () => onSave({ proteinGoal: Number(protein.replace(',', '.')) || 0 });
  const saveCarbs = () => onSave({ carbsGoal: Number(carbs.replace(',', '.')) || 0 });
  const saveFat = () => onSave({ fatGoal: Number(fat.replace(',', '.')) || 0 });

  return (
    <View style={styles.macroRow}>
      <View style={styles.macroField}>
        <TextInput
          value={protein}
          onChangeText={setProtein}
          onEndEditing={saveProtein}
          onBlur={saveProtein}
          keyboardType="decimal-pad"
          style={inputStyle}
        />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {t('protein').toUpperCase()} (G)
        </ThemedText>
      </View>
      <View style={[styles.macroField, styles.macroFieldWide]}>
        <TextInput
          value={carbs}
          onChangeText={setCarbs}
          onEndEditing={saveCarbs}
          onBlur={saveCarbs}
          keyboardType="decimal-pad"
          style={inputStyle}
        />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {t('carbs').toUpperCase()} (G)
        </ThemedText>
      </View>
      <View style={styles.macroField}>
        <TextInput
          value={fat}
          onChangeText={setFat}
          onEndEditing={saveFat}
          onBlur={saveFat}
          keyboardType="decimal-pad"
          style={inputStyle}
        />
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {t('fat').toUpperCase()} (G)
        </ThemedText>
      </View>
    </View>
  );
}

// Android-only (Health Connect doesn't exist on iOS) — fine for now since
// this app has no iOS build yet. States: SDK missing entirely (nothing the
// user can do), Health Connect app needs installing/updating (deep-link to
// its Play Store listing), available-but-not-connected ("Bağlan"), and
// connected (status + link to Health Connect's own settings, since the
// per-data-type toggles live there, not in the OS's generic app-permissions
// screen).
function HealthConnectCard({ cardStyle }: { cardStyle: (object | undefined)[] }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const theme = { ...palette, backgroundSelected: palette.raised, textSecondary: palette.muted, accent: palette.blue, accentOn: palette.background, destructive: palette.red };
  const { t } = useT();
  const { data: status } = useHealthConnectStatus();
  const connect = useConnectHealthConnect();

  if (!status) {
    return null;
  }

  const openPlayStoreListing = () => {
    Linking.openURL('market://details?id=com.google.android.apps.healthdata').catch(() =>
      Linking.openURL('https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')
    );
  };

  // Temporary diagnostic (2026-08-20) — see queryRawSampleCounts's own
  // comment in lib/health-connect.ts. Checks the most recent watch-imported
  // cardio session's own time window. Remove once the answer is known.
  const checkRawSamples = async () => {
    try {
      const [session] = await db
        .select()
        .from(cardioSessions)
        .where(isNotNull(cardioSessions.healthSyncedAt))
        .orderBy(desc(cardioSessions.startedAt))
        .limit(1);
      if (!session) {
        alertMessage('Kontrol', 'Saatten aktarılmış bir antrenman bulunamadı.');
        return;
      }
      const counts = await queryRawSampleCounts(session.startedAt, session.finishedAt ?? session.startedAt);
      alertMessage(
        'Ham Veri Kontrolü (tanı)',
        `"${session.name ?? 'Antrenman'}" (${session.startedAt}) için:\n\nNabız ölçümü: ${counts.heartRateSamples}\nHız ölçümü: ${counts.speedSamples}`
      );
    } catch (error) {
      // Previously unhandled — a missing Health Connect permission (Distance/
      // ElevationGained/Speed weren't requested until this same fix) made
      // this throw silently, reading as "the button does nothing."
      alertMessage('Kontrol Başarısız', friendlyErrorMessage(error, 'Kontrol tamamlanamadı, lütfen tekrar dene.'));
    }
  };

  return (
    <View style={cardStyle}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t('healthData').toUpperCase()}
      </ThemedText>

      {status.error && (
        <ThemedText type="small" style={{ color: '#e05252' }}>
          {t('healthConnectStatusError')}: {status.error}
        </ThemedText>
      )}

      {status.availability === 'unavailable' && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('healthConnectUnsupported')}
        </ThemedText>
      )}

      {status.availability === 'update-required' && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('healthConnectNotInstalled')}
          </ThemedText>
          <Pressable
            onPress={openPlayStoreListing}
            style={[styles.healthConnectButton, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold">{t('openInPlayStore')}</ThemedText>
          </Pressable>
        </>
      )}

      {status.availability === 'available' && !status.connected && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('importFromDevice')}
          </ThemedText>
          <Pressable
            onPress={() => connect.mutate()}
            disabled={connect.isPending}
            style={[styles.healthConnectButton, { backgroundColor: theme.accent, opacity: connect.isPending ? 0.7 : 1 }]}>
            {connect.isPending ? (
              <ActivityIndicator color={theme.accentOn} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.accentOn }}>
                {t('connect')}
              </ThemedText>
            )}
          </Pressable>
        </>
      )}

      {status.availability === 'available' && status.connected && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t('healthConnectConnected')}
          </ThemedText>
          <Pressable onPress={() => openHealthConnectSettings()} hitSlop={4}>
            <ThemedText type="small" style={{ color: theme.accent }}>
              {t('openHealthConnectSettings')}
            </ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

// Diagnostic view onto PowerSync's own sync state — added 2026-08-12 while
// tracking down a stuck sync queue that produced no visible error for long
// stretches (uploadData() only throws/alerts when it's actually invoked;
// this shows what's happening even when nothing is throwing at all, e.g. a
// still-connecting client or an empty local crud queue).
// connected/uploading/etc. are getters on the SyncStatus class instance, not
// own enumerable properties — {...currentStatus} would silently spread to an
// empty object, so each field is read out explicitly instead.
function readSyncStatus() {
  const s = powerSyncDb.currentStatus;
  return {
    connected: s.connected,
    connecting: s.connecting,
    uploading: s.uploading,
    downloading: s.downloading,
    hasSynced: s.hasSynced,
    lastSyncedAt: s.lastSyncedAt,
    uploadError: s.uploadError,
    downloadError: s.downloadError,
  };
}

// Reads the LOCAL device's own row count, bypassing every join/display
// query entirely — added 2026-08-12 to answer one question precisely: is
// data actually missing from this device, or just not being displayed?
// (also counts how many local nutritionLogs reference a foodId that
// doesn't exist in the local foods table at all, which would explain a
// display gap even with the leftJoin fix already in place.)
async function readLocalNutritionCounts() {
  const logs = await db.select({ foodId: nutritionLogs.foodId }).from(nutritionLogs);
  const localFoodIds = new Set((await db.select({ id: foods.id }).from(foods)).map((row) => row.id));
  const unresolved = logs.filter((log) => !localFoodIds.has(log.foodId)).length;
  return { total: logs.length, unresolved };
}

// Minimal, user-facing counterpart to the technical SyncStatusCard below
// (queue counts, connection internals) — mounted at the top of Settings so a
// real upload/download failure is never silent, but only ever shows
// friendlyErrorMessage's already-sanitized text, never the raw error.
function SyncWarningBanner() {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [status, setStatus] = useState(readSyncStatus);

  useEffect(() => {
    const refresh = () => setStatus(readSyncStatus());
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  const message = status.uploadError
    ? friendlyErrorMessage(status.uploadError, 'Kayıtların sunucuya gönderilmesinde sorun oluştu.')
    : status.downloadError
      ? friendlyErrorMessage(status.downloadError, 'Sunucudan veri indirilmesinde sorun oluştu.')
      : null;

  if (!message) {
    return null;
  }

  return (
    <View style={styles.syncWarning}>
      <ThemedText type="smallBold" style={{ color: palette.red }}>
        SENKRONİZASYON SORUNU
      </ThemedText>
      <ThemedText type="small" style={{ color: palette.red }}>
        {message}
      </ThemedText>
    </View>
  );
}

function SyncStatusCard({ cardStyle }: { cardStyle: (object | undefined)[] }) {
  const palette = useNutritionPalette();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [status, setStatus] = useState(readSyncStatus);
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [nutritionCounts, setNutritionCounts] = useState<{ total: number; unresolved: number } | null>(null);

  useEffect(() => {
    const refresh = () => {
      setStatus(readSyncStatus());
      powerSyncDb.getUploadQueueStats().then((stats) => setQueueCount(stats.count));
      readLocalNutritionCounts().then(setNutritionCounts);
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={cardStyle}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        SENKRON DURUMU
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Bağlı: {status.connected ? 'evet' : 'HAYIR'} · Bağlanıyor: {status.connecting ? 'evet' : 'hayır'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Yükleniyor: {status.uploading ? 'evet' : 'hayır'} · İndiriliyor: {status.downloading ? 'evet' : 'hayır'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Bekleyen kayıt: {queueCount ?? '–'} · İlk senkron tamam: {status.hasSynced ? 'evet' : 'hayır'}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Yerel beslenme kaydı: {nutritionCounts?.total ?? '–'} · Besini eşleşmeyen: {nutritionCounts?.unresolved ?? '–'}
      </ThemedText>
      {status.lastSyncedAt && (
        <ThemedText type="small" themeColor="textSecondary">
          Son senkron: {status.lastSyncedAt.toLocaleString('tr-TR')}
        </ThemedText>
      )}
      {status.uploadError && (
        <>
          <ThemedText type="small" style={{ color: '#e05252' }}>
            Yükleme hatası: {friendlyErrorMessage(status.uploadError, 'Kayıtların sunucuya gönderilmesinde sorun oluştu.')}
          </ThemedText>
          <ThemedText type="small" selectable style={{ color: '#e05252' }}>
            Ham hata: {status.uploadError instanceof Error ? status.uploadError.message : String(status.uploadError)}
          </ThemedText>
        </>
      )}
      {status.downloadError && (
        <>
          <ThemedText type="small" style={{ color: '#e05252' }}>
            İndirme hatası: {friendlyErrorMessage(status.downloadError, 'Sunucudan veri indirilmesinde sorun oluştu.')}
          </ThemedText>
          <ThemedText type="small" selectable style={{ color: '#e05252' }}>
            Ham hata: {status.downloadError instanceof Error ? status.downloadError.message : String(status.downloadError)}
          </ThemedText>
        </>
      )}
    </View>
  );
}

const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.three,
  },
  brandRow: { height: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: palette.border },
  wordmark: { color: palette.text, fontFamily: Fonts.metric, fontSize: 18, letterSpacing: 2 },
  areaLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 1.2 },
  pageHeading: { paddingVertical: Spacing.three },
  title: {
    color: palette.text,
    fontFamily: Fonts.metric,
    fontSize: 38,
    lineHeight: 42,
  },
  subtitle: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  content: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  sectionLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1.1, marginTop: Spacing.two },
  cardTitle: { color: palette.text, fontFamily: Fonts.technical, fontSize: 11, letterSpacing: 0.7 },
  settingBlock: { gap: Spacing.two },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    borderLeftColor: palette.blue,
  },
  accountText: {
    gap: Spacing.half,
  },
  accountAction: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.7 },
  syncWarning: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.red,
    borderRadius: Radius.md,
    padding: Spacing.three,
    gap: Spacing.half,
  },
  checkUpdateButton: {
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  exportOptions: { gap: Spacing.two },
  exportDates: { flexDirection: 'row', gap: Spacing.two },
  dateInput: { color: palette.text, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontFamily: Fonts.technical, fontSize: 12 },
  exportDateInput: { flex: 1 },
  healthConnectButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
  chipSelected: { backgroundColor: palette.blue, borderColor: palette.blue },
  repMetricDefaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  repMetricDefaultInput: {
    width: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 14,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepperSymbol: { color: palette.text, fontFamily: Fonts.technical, fontSize: 20, lineHeight: 22 },
  stepperValue: {
    minWidth: 120,
    textAlign: 'center',
  },
  timeStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperButtonSmall: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.raised,
    borderWidth: 1,
    borderColor: palette.border,
  },
  timeStepperValue: {
    minWidth: 48,
    textAlign: 'center',
  },
  stepperInput: {
    minWidth: 120,
    fontSize: 32,
    fontFamily: Fonts.semiBold,
    letterSpacing: -0.5,
    textAlign: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 2,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  macroField: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  // "KARBONHİDRAT (G)" is longer than "PROTEIN (G)"/"YAĞ (G)" — at an equal
  // flex:1 share it wrapped ("(G)" dropping to its own line). A bit more
  // width here keeps it on one line without shrinking the label font.
  macroFieldWide: {
    flex: 1.3,
  },
  macroInput: {
    width: '100%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.two,
    fontSize: 16,
    textAlign: 'center',
  },
});
