import type { Assessment } from '@repair/content-schema';
import { isSafetyPositive, scoreAssessment, type Answers, type AssessmentResult } from '@repair/scoring';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Option, ProgressBar, Section } from '@/components/ui';
import { getActivity } from '@/content';
import { useStore } from '@/state/store';

export function AssessmentPlayer({ assessment }: { assessment: Assessment }) {
  const { dispatch } = useStore();
  const [index, setIndex] = useState(-1); // -1 = intro
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const isSafety = assessment.kind === 'safety';

  const finish = (final: Answers) => {
    const r = scoreAssessment(assessment, final);
    dispatch({ type: 'saveResult', assessmentId: assessment.id, result: r });
    if (isSafety) dispatch({ type: 'safetyScreenCompleted', positive: isSafetyPositive(r) });
    else if (r.flags.length) dispatch({ type: 'setSafetyMode', on: true });
    setResult(r);
  };

  const answer = (value: number | undefined) => {
    const item = assessment.items[index]!;
    const next = { ...answers };
    if (value === undefined) delete next[item.id];
    else next[item.id] = value;
    setAnswers(next);
    if (index + 1 >= assessment.items.length) finish(next);
    else setIndex(index + 1);
  };

  if (result) return isSafety ? <SafetyResult positive={isSafetyPositive(result)} /> : <Result assessment={assessment} result={result} />;

  if (index < 0) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{assessment.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{assessment.intro}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {assessment.items.length} questions · about {assessment.minutes} min
        </ThemedText>
        <Button label="Start" onPress={() => setIndex(0)} />
      </View>
    );
  }

  const item = assessment.items[index]!;
  const { min, labels } = assessment.scale;
  return (
    <View style={styles.gap}>
      <ProgressBar value={index / assessment.items.length} />
      <ThemedText type="small" themeColor="textSecondary">
        {index + 1} of {assessment.items.length}
      </ThemedText>
      <ThemedText type="subtitle">{item.text}</ThemedText>
      <View style={styles.options}>
        {labels.map((label, i) => (
          <Option key={label} label={label} selected={answers[item.id] === min + i} onPress={() => answer(min + i)} />
        ))}
      </View>
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
        {!isSafety && <Button label="Skip" variant="secondary" onPress={() => answer(undefined)} />}
      </View>
    </View>
  );
}

function SafetyResult({ positive }: { positive: boolean }) {
  return (
    <View style={styles.gap}>
      <ThemedText type="title">Thank you</ThemedText>
      {positive ? (
        <>
          <ThemedText>
            Some of your answers suggest you may not always feel safe. You are not alone, and it is
            not your fault. Confidential support is available any time.
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            For now, we've paused activities that are done together or that can raise conflict.
            Learning and private reflection are still available. Only you can see this.
          </ThemedText>
          <Button label="See support options" variant="safety" onPress={() => router.replace('/safety')} />
        </>
      ) : (
        <ThemedText themeColor="textSecondary">
          You can retake this check privately any time from Safety & Support.
        </ThemedText>
      )}
      <Button label="Continue" variant={positive ? 'secondary' : 'primary'} onPress={() => router.back()} />
    </View>
  );
}

function Result({ assessment, result }: { assessment: Assessment; result: AssessmentResult }) {
  const recs = result.recommendations.map(getActivity).filter((a) => a !== undefined).slice(0, 4);
  return (
    <View style={styles.gap}>
      <ThemedText type="small" themeColor="textSecondary">
        {assessment.title}
      </ThemedText>
      <ThemedText type="title">{result.band?.label ?? 'Results'}</ThemedText>
      {result.band && <ThemedText>{result.band.narrative}</ThemedText>}

      {result.flags.length > 0 && (
        <Card tone="safety" onPress={() => router.replace('/safety')}>
          <ThemedText type="smallBold" themeColor="safety">
            Your safety matters most
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Some answers suggest conflict may sometimes feel unsafe. We've paused activities done
            together. Tap for confidential support. Only you can see this.
          </ThemedText>
        </Card>
      )}

      <Section title="Areas (higher = more strain)">
        {result.subscales
          .filter((s) => s.score !== null)
          .map((s) => (
            <View key={s.id} style={styles.bar}>
              <ThemedText type="small">{s.label}</ThemedText>
              <ProgressBar value={(s.score ?? 0) / 100} />
            </View>
          ))}
      </Section>

      {recs.length > 0 && (
        <Section title="Recommended next">
          {recs.map((a) => (
            <Card key={a.id} onPress={() => router.replace(`/activity/${a.id}`)}>
              <ThemedText type="smallBold">{a.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {a.summary}
              </ThemedText>
            </Card>
          ))}
        </Section>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        These results are private. This is a reflection tool, not a diagnosis.
      </ThemedText>
      <Button label="Done" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  options: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  bar: { gap: 4 },
});
