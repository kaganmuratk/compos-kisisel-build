import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { powerSyncDb } from '@/db/powersync';
import { authRedirectTo } from '@/hooks/use-auth-deep-link';
import { useAuth } from '@/hooks/use-auth';
import { friendlyErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useT, type AppLanguage } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
// A full self-service delete needs a service_role-privileged Supabase Edge
// Function (the client SDK deliberately can't remove an auth user itself) —
// out of scope here. This routes the request to a human instead, which is
// still a real self-service path for a small user base.
const SUPPORT_EMAIL = 'kaganmuratyedek@gmail.com';
// AppGallery rule 7.5: the privacy policy must be shown when the app first
// launches and on sign-in/sign-up. With no session the app opens straight
// on this screen, so this is the first-launch prompt too. Bump the version
// whenever the live policy's "Last updated" date changes.
const PRIVACY_POLICY_URL = 'https://compos-kagan.pages.dev/privacy';
const PRIVACY_POLICY_VERSION = '2026-10-08';

export default function AccountScreen() {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t } = useT();
  const { user, loading } = useAuth();
  // Clicking the password-reset email link signs the user in via a
  // recovery session — indistinguishable from a normal session except for
  // this event, which is the only reliable signal to show "set a new
  // password" instead of silently landing on the normal signed-in view
  // with the OLD password still active.
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScreenHeader onBack={() => router.back()} eyebrow={t('yourAccess').toUpperCase()} title={(recovery ? t('reset') : user ? t('accountLabel') : t('welcome')).toUpperCase()} accentColor={palette.blue} />
        {/* Scrollable: the sign-up form (backup + language + privacy consent) is taller than a 16:9 phone screen. */}
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {loading ? <ActivityIndicator color={palette.blue} style={styles.loading} /> : recovery ? <SetNewPasswordView onDone={() => setRecovery(false)} /> : user ? <SignedInView email={user.email ?? ''} /> : <AuthForm />}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function SetNewPasswordView({ onDone }: { onDone: () => void }) {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!PASSWORD_REGEX.test(password)) {
      setError(t('passwordRequirementsError'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(friendlyErrorMessage(updateError, t('couldNotUpdatePassword')));
      return;
    }
    onDone();
  };

  return (
    <View style={styles.card}>
      <ThemedText style={styles.cardLabel}>{t('setNewPassword').toUpperCase()}</ThemedText>
      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>{t('newPassword').toUpperCase()}</ThemedText>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
        <ThemedText style={styles.hint}>{t('passwordRequirements').toUpperCase()}</ThemedText>
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable accessibilityRole="button" onPress={submit} disabled={submitting} style={({ pressed }) => [styles.submitButton, (submitting || pressed) && styles.pressed]}>
        {submitting ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.submitLabel}>{t('updatePassword').toUpperCase()}</ThemedText>}
      </Pressable>
    </View>
  );
}

function SignedInView({ email }: { email: string }) {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const { t } = useT();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await powerSyncDb.disconnectAndClear();
    await supabase.auth.signOut();
    setSigningOut(false);
  };

  const requestDeletion = () => {
    const send = () => {
      const subject = encodeURIComponent('Compos - Account deletion request');
      const body = encodeURIComponent(`Please delete my Compos account and its data.\n\nAccount email: ${email}`);
      Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('deleteAccountConfirmMessage'))) send();
      return;
    }
    Alert.alert(t('deleteAccountTitle'), t('deleteAccountConfirmMessage'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('proceed'), style: 'destructive', onPress: send },
    ]);
  };

  return (
    <View style={styles.card}>
      <ThemedText style={styles.cardLabel}>{t('signedInAs').toUpperCase()}</ThemedText>
      <ThemedText style={styles.email}>{email}</ThemedText>
      <View style={styles.rule} />
      <Pressable accessibilityRole="button" onPress={signOut} disabled={signingOut} style={({ pressed }) => [styles.signOutButton, (signingOut || pressed) && styles.pressed]}>
        {signingOut ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.signOutLabel}>{t('signOut').toUpperCase()}</ThemedText>}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={requestDeletion} style={styles.deleteLink} hitSlop={8}>
        <ThemedText style={styles.deleteLinkLabel}>{t('requestAccountDeletion').toUpperCase()}</ThemedText>
      </Pressable>
    </View>
  );
}

function AuthForm() {const palette=useNutritionPalette();const styles=useMemo(()=>createStyles(palette),[palette]);
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mediaCloudBackup, setMediaCloudBackup] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>('en');
  const { t } = useT(language);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async () => {
    if (mode === 'reset') {
      if (!email.trim()) {
        setError(t('emailRequired'));
        return;
      }
      setSubmitting(true);
      setError(null);
      // Supabase deliberately returns success here regardless of whether the
      // email is registered — never branch UI on the result, or this leaks
      // account existence to anyone who tries an address.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectTo });
      setSubmitting(false);
      if (resetError) {
        setError(friendlyErrorMessage(resetError, t('couldNotSendResetLink')));
        return;
      }
      setResetSent(true);
      return;
    }
    if (!email.trim() || !password) {
      setError(t('emailAndPasswordRequired'));
      return;
    }
    if (mode === 'signUp' && !PASSWORD_REGEX.test(password)) {
      setError(t('passwordRequirementsError'));
      return;
    }
    if (mode === 'signUp' && !privacyAccepted) {
      setError(t('privacyConsentRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: authError } = mode === 'signIn'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authRedirectTo, data: { media_cloud_backup: mediaCloudBackup, language, privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_policy_accepted_at: new Date().toISOString() } } });
    setSubmitting(false);
    if (authError) {
      setError(friendlyErrorMessage(authError, t('couldNotSignIn')));
      return;
    }
    if (mode === 'signIn') {
      router.dismissTo('/(tabs)');
      return;
    }
    setConfirmationSent(true);
  };

  if (confirmationSent) {
    const body = language === 'tr'
      ? `${email} adresine doğrulama bağlantısı gönderdik. Onayladıktan sonra giriş yapabilirsin.`
      : `We sent a verification link to ${email}. You can sign in once you confirm it.`;
    return <View style={styles.card}><ThemedText style={styles.cardLabel}>{t('confirmYourEmail').toUpperCase()}</ThemedText><ThemedText style={styles.confirmationTitle}>{t('checkYourInbox').toUpperCase()}</ThemedText><ThemedText style={styles.bodyCopy}>{body}</ThemedText></View>;
  }

  if (resetSent) {
    const body = language === 'tr'
      ? `${email.trim()} bu adrese kayıtlıysa, şifre sıfırlama bağlantısı gönderdik.`
      : `If ${email.trim()} is registered, we sent a password reset link to it.`;
    return <View style={styles.card}><ThemedText style={styles.cardLabel}>{t('checkYourInbox').toUpperCase()}</ThemedText><ThemedText style={styles.confirmationTitle}>{t('resetLinkSent').toUpperCase()}</ThemedText><ThemedText style={styles.bodyCopy}>{body}</ThemedText><Pressable accessibilityRole="button" onPress={() => { setMode('signIn'); setResetSent(false); setError(null); }} style={styles.switchModeLink} hitSlop={8}><ThemedText style={styles.switchModeLabel}>{t('backToSignIn').toUpperCase()}</ThemedText></Pressable></View>;
  }

  return (
    <View style={styles.card}>
      <ThemedText style={styles.cardLabel}>{mode === 'signIn' ? t('signInToContinue').toUpperCase() : mode === 'signUp' ? t('createYourAccount').toUpperCase() : t('resetYourPassword').toUpperCase()}</ThemedText>
      <View style={styles.field}>
        <ThemedText style={styles.fieldLabel}>{t('email').toUpperCase()}</ThemedText>
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={palette.muted} style={styles.input} />
      </View>
      {mode !== 'reset' && (
        <View style={styles.field}>
          <ThemedText style={styles.fieldLabel}>{t('password').toUpperCase()}</ThemedText>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" style={styles.input} />
          {mode === 'signUp' ? <ThemedText style={styles.hint}>{t('passwordRequirements').toUpperCase()}</ThemedText> : null}
        </View>
      )}
      {mode === 'signUp' ? <View style={styles.backupChoice}><ThemedText style={styles.fieldLabel}>{t('backupQuestion').toUpperCase()}</ThemedText><ThemedText style={styles.hint}>{t('backupHint')}</ThemedText><View style={styles.backupButtons}><Pressable onPress={() => setMediaCloudBackup(true)} style={[styles.backupButton, mediaCloudBackup && styles.backupButtonSelected]}><ThemedText style={[styles.backupButtonLabel, mediaCloudBackup && styles.backupButtonLabelSelected]}>{t('yesBackup').toUpperCase()}</ThemedText></Pressable><Pressable onPress={() => setMediaCloudBackup(false)} style={[styles.backupButton, !mediaCloudBackup && styles.backupButtonSelected]}><ThemedText style={[styles.backupButtonLabel, !mediaCloudBackup && styles.backupButtonLabelSelected]}>{t('noBackup').toUpperCase()}</ThemedText></Pressable></View></View> : null}
      {mode === 'signUp' ? <View style={styles.backupChoice}><ThemedText style={styles.fieldLabel}>{t('language').toUpperCase()}</ThemedText><View style={styles.backupButtons}><Pressable onPress={() => setLanguage('en')} style={[styles.backupButton, language === 'en' && styles.backupButtonSelected]}><ThemedText style={[styles.backupButtonLabel, language === 'en' && styles.backupButtonLabelSelected]}>ENGLISH</ThemedText></Pressable><Pressable onPress={() => setLanguage('tr')} style={[styles.backupButton, language === 'tr' && styles.backupButtonSelected]}><ThemedText style={[styles.backupButtonLabel, language === 'tr' && styles.backupButtonLabelSelected]}>TÜRKÇE</ThemedText></Pressable></View></View> : null}
      {mode === 'signUp' ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: privacyAccepted }} onPress={() => setPrivacyAccepted((v) => !v)} style={styles.consentRow} hitSlop={6}>
          <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>{privacyAccepted ? <ThemedText style={styles.checkboxMark}>✓</ThemedText> : null}</View>
          <ThemedText style={[styles.consentText, styles.consentRowText]}>{t('privacyConsentSignUp')} <ThemedText style={styles.consentLink} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>{t('privacyPolicy')}</ThemedText></ThemedText>
        </Pressable>
      ) : mode === 'signIn' ? (
        <ThemedText style={styles.consentText}>{t('privacyConsentSignIn')} <ThemedText style={styles.consentLink} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>{t('privacyPolicy')}</ThemedText></ThemedText>
      ) : null}
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Pressable accessibilityRole="button" onPress={submit} disabled={submitting} style={({ pressed }) => [styles.submitButton, (submitting || pressed) && styles.pressed]}>
        {submitting ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.submitLabel}>{mode === 'signIn' ? t('signIn').toUpperCase() : mode === 'signUp' ? t('createAccount').toUpperCase() : t('sendResetLink').toUpperCase()}</ThemedText>}
      </Pressable>
      {mode === 'signIn' && (
        <Pressable accessibilityRole="button" onPress={() => { setMode('reset'); setError(null); }} style={styles.switchModeLink} hitSlop={8}>
          <ThemedText style={styles.switchModeLabel}>{t('forgotPassword').toUpperCase()}</ThemedText>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={() => { setMode(mode === 'signUp' ? 'signIn' : mode === 'reset' ? 'signIn' : 'signUp'); setError(null); }} style={styles.switchModeLink} hitSlop={8}>
        <ThemedText style={styles.switchModeLabel}>{mode === 'signUp' ? t('alreadyHaveAccount').toUpperCase() : mode === 'reset' ? t('backToSignIn').toUpperCase() : t('newHere').toUpperCase()}</ThemedText>
      </Pressable>
    </View>
  );
}

const createStyles=(palette:ReturnType<typeof useNutritionPalette>)=>StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.background },
  safeArea: { flex: 1, paddingHorizontal: Spacing.three },
  loading: { marginTop: Spacing.six },
  scrollContent: { paddingBottom: Spacing.six },
  card: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: Spacing.three, gap: Spacing.three },
  cardLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  email: { color: palette.text, fontFamily: Fonts.metricMedium, fontSize: 23, lineHeight: 28 },
  rule: { height: 1, backgroundColor: palette.border },
  signOutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.red },
  signOutLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
  deleteLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLinkLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, letterSpacing: 0.7 },
  field: { gap: Spacing.one },
  fieldLabel: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 1 },
  input: { minHeight: 48, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised, color: palette.text, paddingHorizontal: Spacing.three, fontFamily: Fonts.medium, fontSize: 15 },
  hint: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 8, lineHeight: 13, letterSpacing: 0.4 },
  backupChoice: { gap: Spacing.two },
  backupButtons: { gap: Spacing.one },
  backupButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised },
  backupButtonSelected: { borderColor: palette.blue, backgroundColor: palette.blue },
  backupButtonLabel: { color: palette.text, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5 },
  backupButtonLabelSelected: { color: palette.background },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.raised, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: palette.blue, backgroundColor: palette.blue },
  checkboxMark: { color: palette.background, fontSize: 13, lineHeight: 16 },
  consentText: { color: palette.muted, fontFamily: Fonts.medium, fontSize: 12, lineHeight: 18 },
  // The sign-up row is horizontal next to the checkbox, so only there may the text
  // take the remaining width; a bare flex: 1 in the vertical card collapses it to 0 height on native.
  consentRowText: { flex: 1 },
  consentLink: { color: palette.blue, fontFamily: Fonts.medium, fontSize: 12, lineHeight: 18, textDecorationLine: 'underline' },
  error: { color: palette.red, fontFamily: Fonts.technical, fontSize: 10, lineHeight: 16 },
  submitButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue },
  submitLabel: { color: palette.background, fontFamily: Fonts.technical, fontSize: 10, letterSpacing: 1.1 },
  switchModeLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  switchModeLabel: { color: palette.blue, fontFamily: Fonts.technical, fontSize: 9, letterSpacing: 0.5, textAlign: 'center' },
  confirmationTitle: { color: palette.text, fontFamily: Fonts.metric, fontSize: 28, lineHeight: 32 },
  bodyCopy: { color: palette.muted, fontFamily: Fonts.technical, fontSize: 10, lineHeight: 16 },
  pressed: { opacity: 0.72 },
});
