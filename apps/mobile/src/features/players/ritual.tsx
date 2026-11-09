import type { Ritual } from '@repair/content-schema';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, ProgressBar } from '@/components/ui';
import { useStore } from '@/state/store';

export function RitualPlayer({ ritual }: { ritual: Ritual }) {
  const { state, dispatch } = useStore();
  const done = (state.progress[ritual.id]?.data.days as number[] | undefined) ?? [];

  const toggle = (day: number) => {
    const days = done.includes(day) ? done.filter((d) => d !== day) : [...done, day];
    dispatch({
      type: 'saveProgress',
      activityId: ritual.id,
      data: { days },
      completed: days.length === ritual.days.length,
    });
  };

  return (
    <View style={styles.gap}>
      <ThemedText type="title">{ritual.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{ritual.intro}</ThemedText>
      <ProgressBar value={done.length / ritual.days.length} />
      {ritual.days.map((d) => {
        const checked = done.includes(d.day);
        return (
          <Card key={d.day} tone={checked ? 'accent' : 'default'} onPress={() => toggle(d.day)}>
            <ThemedText type="smallBold">
              {checked ? '✓ ' : ''}Day {d.day}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {d.task}
            </ThemedText>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ gap: { gap: 12 } });
