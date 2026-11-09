import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Option } from '@/components/ui';
import { content } from '@/content';
import { newId, useStore } from '@/state/store';

const today = () => new Date().toISOString().slice(0, 10);

export function DailyCheckin() {
  const { state, dispatch } = useStore();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const doneToday = state.checkins.some((c) => c.kind === 'daily' && c.createdAt.slice(0, 10) === today());

  if (doneToday) {
    return (
      <Card>
        <ThemedText type="smallBold">Daily check-in done ✓</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {state.checkins.filter((c) => c.kind === 'daily').length} check-ins so far.
        </ThemedText>
      </Card>
    );
  }

  const questions = content.checkins.daily;
  const ready = questions.filter((q) => q.kind === 'scale').every((q) => answers[q.id] !== undefined);

  return (
    <Card>
      <ThemedText type="smallBold">Daily check-in</ThemedText>
      {questions.map((q) => (
        <View key={q.id} style={styles.q}>
          <ThemedText type="small">{q.text}</ThemedText>
          {q.kind === 'scale' ? (
            <View style={styles.row}>
              {(q.labels ?? []).map((label, i) => (
                <View key={label} style={styles.cell}>
                  <Option label={label} selected={answers[q.id] === i} onPress={() => setAnswers({ ...answers, [q.id]: i })} />
                </View>
              ))}
            </View>
          ) : (
            <Input
              placeholder="Optional"
              value={String(answers[q.id] ?? '')}
              onChangeText={(t) => setAnswers({ ...answers, [q.id]: t })}
            />
          )}
        </View>
      ))}
      <Button
        label="Save check-in"
        disabled={!ready}
        onPress={() =>
          dispatch({ type: 'addCheckin', checkin: { id: newId(), kind: 'daily', answers, createdAt: new Date().toISOString() } })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  q: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { flexGrow: 1 },
});
