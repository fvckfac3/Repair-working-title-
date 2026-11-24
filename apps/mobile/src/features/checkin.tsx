import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Option } from '@/components/ui';
import { content } from '@/content';
import { newId, useStore } from '@/state/store';
import { localDay } from './players/player-logic';

export function DailyCheckin() {
  const { state, dispatch } = useStore();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [hidden, setHidden] = useState(false);
  const today = localDay(new Date());
  const doneToday = state.checkins.some((c) => c.kind === 'daily' && localDay(new Date(c.createdAt)) === today);
  if (doneToday) return <Card><ThemedText type="smallBold">Daily check-in done</ThemedText><ThemedText type="small" themeColor="textSecondary">{state.checkins.filter((c) => c.kind === 'daily').length} check-ins so far.</ThemedText></Card>;
  if (hidden) return <Card><ThemedText type="small">Check-in skipped for now.</ThemedText><Button label="Open check-in" variant="secondary" onPress={() => setHidden(false)} /></Card>;
  const questions = content.checkins.daily;
  const ready = Object.values(answers).some((value) => typeof value === 'number' || value.trim().length > 0);
  return (
    <Card>
      <ThemedText type="smallBold">Daily check-in</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">All questions are optional. Answers are saved on this device only when you tap Save; anyone with device access may see them.</ThemedText>
      {questions.map((q) => (
        <View key={q.id} style={styles.q}>
          <ThemedText type="small">{q.id === 'note' ? 'Anything else you would like to note? (optional)' : q.text}</ThemedText>
          {q.kind === 'scale' || q.kind === 'choice' ? (
            <View style={styles.row}>
              {(q.kind === 'scale' ? q.labels ?? [] : q.options ?? []).map((label, i) => {
                const value = q.kind === 'scale' ? i : label;
                return <View key={`${label}-${i}`} style={styles.cell}><Option label={label} selected={answers[q.id] === value} onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: value }))} /></View>;
              })}
            </View>
          ) : (
            <Input accessibilityLabel={q.id === 'note' ? 'Optional note' : q.text} placeholder="Optional" value={String(answers[q.id] ?? '')} onChangeText={(t) => setAnswers((prev) => ({ ...prev, [q.id]: t }))} />
          )}
        </View>
      ))}
      <Button label="Save check-in" disabled={!ready} onPress={() => dispatch({ type: 'addCheckin', checkin: { id: newId(), kind: 'daily', answers, createdAt: new Date().toISOString() } })} />
      <Button label="Skip for now" variant="secondary" onPress={() => { setAnswers({}); setHidden(true); }} />
    </Card>
  );
}
const styles = StyleSheet.create({ q: { gap: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, cell: { flexGrow: 1 } });
