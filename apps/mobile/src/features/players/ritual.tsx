import type { Ritual } from '@repair/content-schema';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Option, ProgressBar } from '@/components/ui';
import { useStore } from '@/state/store';
export function RitualPlayer({ ritual }: { ritual: Ritual }) {
  const { state, dispatch } = useStore();
  const raw = state.progress[ritual.id]?.data.days;
  const validDays = new Set(ritual.days.map((d) => d.day));
  const done = Array.isArray(raw) ? [...new Set(raw.filter((d): d is number => typeof d === 'number' && validDays.has(d)))] : [];
  const toggle = (day: number) => {
    const days = done.includes(day) ? done.filter((d) => d !== day) : [...done, day];
    dispatch({ type: 'saveProgress', activityId: ritual.id, data: { days }, completed: days.length === validDays.size });
  };
  return (
    <View style={styles.gap}>
      <ThemedText type="title">{ritual.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{ritual.intro}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Mark days you choose to do. You can stop at any time. Progress is stored on this device; no reminders are sent.</ThemedText>
      <ProgressBar value={done.length / validDays.size} />
      <ThemedText type="small">{done.length} of {validDays.size} days marked</ThemedText>
      {state.progress[ritual.id]?.status === 'completed' && done.length < validDays.size && (
        <ThemedText type="small" themeColor="textSecondary">This ritual was completed earlier; the marks below reflect your current selections.</ThemedText>
      )}
      {ritual.days.map((d) => {
        const checked = done.includes(d.day);
        return <Option key={d.day} label={`Day ${d.day} · ${checked ? 'Marked' : 'Not marked'}\n${d.task}`} selected={checked} onPress={() => toggle(d.day)} />;
      })}
    </View>
  );
}
const styles = StyleSheet.create({ gap: { gap: 12 } });
