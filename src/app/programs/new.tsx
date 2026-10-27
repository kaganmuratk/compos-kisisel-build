import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PaletteText as ThemedText, useNutritionPalette } from '@/components/nutrition-ui';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useAddProgram } from '@/db/queries/programs';
import { useT } from '@/lib/i18n';
import { TextInput } from '@/components/text-input';
import { softSheet } from '@/constants/soft-sheet';

export default function NewProgramScreen() {
  const { t } = useT();
  const palette = useNutritionPalette(); const styles = useMemo(() => createStyles(palette), [palette]);
  const [name, setName] = useState(''); const addProgram = useAddProgram();
  const save = async () => { if (!name.trim()) return; const program = await addProgram.mutateAsync(name.trim()); router.replace({ pathname: '/programs/[id]', params: { id: String(program.id) } }); };
  return <ThemedView lightColor={palette.background} darkColor={palette.background} style={styles.page}><SafeAreaView style={styles.safe} edges={['top']}><ScreenHeader eyebrow={t('yourPrograms').toUpperCase()} title={t('newProgram').toUpperCase()} accentColor={palette.blue} backHref="/programs" /><View style={styles.card}><ThemedText style={styles.label}>{t('programName').toUpperCase()}</ThemedText><TextInput value={name} onChangeText={setName} placeholder={t('programNamePlaceholder')} placeholderTextColor={palette.muted} style={styles.input} /><Pressable onPress={save} disabled={!name.trim() || addProgram.isPending} style={[styles.primary, !name.trim() && styles.disabled]}>{addProgram.isPending ? <ActivityIndicator color={palette.background} /> : <ThemedText style={styles.primaryLabel}>{t('createProgram').toUpperCase()}</ThemedText>}</Pressable></View></SafeAreaView></ThemedView>;
}
const createStyles = (palette: ReturnType<typeof useNutritionPalette>) => softSheet({ page:{flex:1,backgroundColor:palette.background},safe:{flex:1,paddingHorizontal:Spacing.three},card:{backgroundColor:palette.card,borderWidth:1,borderColor:palette.border,padding:Spacing.three,gap:Spacing.three},label:{color:palette.muted,fontFamily:Fonts.technical,fontSize:9,letterSpacing:1},input:{minHeight:48,borderWidth:1,borderColor:palette.border,backgroundColor:palette.raised,color:palette.text,paddingHorizontal:Spacing.three,fontFamily:Fonts.medium,fontSize:15},primary:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:palette.blue},primaryLabel:{color:palette.background,fontFamily:Fonts.technical,fontSize:10,letterSpacing:1.1},disabled:{opacity:.45} });
