import type { Lesson } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Option, ProgressBar } from '@/components/ui';
import { useStore } from '@/state/store';

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { dispatch } = useStore();
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const total = lesson.cards.length + 1; // + takeaway
  const onTakeaway = index >= lesson.cards.length;
  const card = lesson.cards[index];
  const { takeaway } = lesson;

  return (
    <View style={styles.gap}>
      <ProgressBar value={(index + 1) / total} />
      <ThemedText type="small" themeColor="textSecondary">
        {lesson.title}
      </ThemedText>

      {!onTakeaway && card ? (
        <Card style={styles.card}>
          {card.heading && <ThemedText type="subtitle">{card.heading}</ThemedText>}
          <ThemedText>{card.body}</ThemedText>
        </Card>
      ) : (
        <View style={styles.gap}>
          <ThemedText type="subtitle">{takeaway.question}</ThemedText>
          {takeaway.options.map((o, i) => (
            <Option key={o} label={o} selected={choice === i} onPress={() => setChoice(i)} />
          ))}
          {choice !== null && (
            <Card tone={takeaway.answer === undefined || takeaway.answer === choice ? 'accent' : 'default'}>
              <ThemedText type="small">
                {takeaway.answer === undefined
                  ? 'Thanks for reflecting.'
                  : takeaway.answer === choice
                    ? 'Yes, exactly.'
                    : `A better fit: "${takeaway.options[takeaway.answer]}"`}
              </ThemedText>
              {takeaway.explanation && (
                <ThemedText type="small" themeColor="textSecondary">
                  {takeaway.explanation}
                </ThemedText>
              )}
            </Card>
          )}
        </View>
      )}

      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
        {onTakeaway ? (
          <Button
            label="Finish lesson"
            disabled={choice === null}
            onPress={() => {
              dispatch({ type: 'saveProgress', activityId: lesson.id, data: { takeaway: choice }, completed: true });
              router.back();
            }}
          />
        ) : (
          <Button label="Next" onPress={() => setIndex(index + 1)} />
        )}
      </View>
      {lesson.sources.length > 0 && onTakeaway && (
        <ThemedText type="small" themeColor="textSecondary">
          Further reading: {lesson.sources.join(' · ')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  card: { minHeight: 220, gap: 12 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
});
