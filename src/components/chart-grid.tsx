import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// Lightweight "coordinate plane" grid overlay for the hand-rolled bar charts
// (which don't use react-native-gifted-charts). Lines are laid out via
// flexbox space-between rather than measured pixel math, so no onLayout is
// needed — matches the grid look of the gifted-charts LineChart screens
// (see analysis/body/[metric].tsx, analysis/exercises/[id].tsx).
export function ChartGrid({ rows, columns }: { rows: number; columns?: number }) {
  const theme = useTheme();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.rows}>
        {Array.from({ length: rows + 1 }).map((_, i) => (
          <View key={i} style={[styles.hLine, { borderColor: theme.border }]} />
        ))}
      </View>
      {columns != null && columns > 0 && (
        <View style={[StyleSheet.absoluteFill, styles.columns]}>
          {Array.from({ length: columns + 1 }).map((_, i) => (
            <View key={i} style={[styles.vLine, { borderColor: theme.border }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  columns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vLine: {
    width: 0,
    height: '100%',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
