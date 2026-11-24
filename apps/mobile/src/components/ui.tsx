import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** `padTop` marks a top-level tab screen: no header, and it sits above the tab bar. */
export function Screen({ children, padTop = false }: { children: ReactNode; padTop?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.screen,
        { paddingTop: padTop ? insets.top + Spacing.three : Spacing.three, paddingBottom: insets.bottom + Spacing.six + (padTop ? BottomTabInset : 0) },
      ]}>
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

export function Card({
  children,
  onPress,
  style,
  tone = 'default',
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: 'default' | 'accent' | 'safety';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  const borderColor = tone === 'accent' ? theme.accent : tone === 'safety' ? theme.safety : theme.border;
  const body = (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor }, style]}>{children}</View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'safety';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const bg = variant === 'primary' ? theme.accent : variant === 'safety' ? theme.safety : theme.backgroundSelected;
  const fg = variant === 'secondary' ? theme.text : theme.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
      <ThemedText type="smallBold" style={{ color: fg }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Option({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        compact && styles.compactOption,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.accent : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

export function Pill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.pillText}>
        {label}
      </ThemedText>
    </View>
  );
}

export function Input(props: React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        props.multiline && { minHeight: 110, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

export function ProgressBar({ value, label = 'Progress' }: { value: number; label?: string }) {
  const theme = useTheme();
  const percent = Number.isFinite(value) ? Math.round(Math.min(1, Math.max(0, value)) * 100) : 0;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: percent }} style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { backgroundColor: theme.accent, width: `${percent}%` }]} />
    </View>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: Spacing.three, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.three },
  card: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  pressed: { opacity: 0.75 },
  button: { borderRadius: 999, minHeight: 48, paddingVertical: 14, paddingHorizontal: Spacing.four, alignItems: 'center', justifyContent: 'center' },
  option: { borderRadius: 12, borderWidth: 1.5, minHeight: 44, paddingVertical: 12, paddingHorizontal: Spacing.three, justifyContent: 'center' },
  compactOption: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 12, lineHeight: 18 },
  input: { borderRadius: 12, borderWidth: 1, padding: Spacing.three, fontSize: 16 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
  fill: { height: 6, borderRadius: 3 },
  section: { gap: Spacing.two, marginTop: Spacing.two },
  sectionTitle: { letterSpacing: 0.8, fontSize: 12 },
});
