import type { Assessment } from '@repair/content-schema';
import { scoreAssessment, type Answers, type AssessmentResult } from '@repair/scoring';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Option, ProgressBar, Section } from '@/components/ui';
import { getActivity } from '@/content';
import { useStore } from '@/state/store';
import { assessmentDisposition } from './player-logic';

export function AssessmentPlayer({ assessment }: { assessment: Assessment }) {
  const { state, dispatch } = useStore();
  const [index, setIndex] = useState(-1);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const isSafety = assessment.kind === 'safety';
  const finish = (final: Answers) => {
    const r = scoreAssessment(assessment, final);
    const disposition = assessmentDisposition(assessment, r, state.safetyMode);
    if (disposition.completeSafetyScreen) dispatch({ type: 'safetyScreenCompleted', positive: disposition.activateSafety });
    else if (disposition.activateSafety) dispatch({ type: 'setSafetyMode', on: true });
    setResult(r);
    setAnswers({});
  };
  const answer = (value: number | undefined) => {
    const item = assessment.items[index]!;
    const next = { ...answers };
    if (value === undefined) delete next[item.id];
    else next[item.id] = value;
    // Act as soon as a flag is raised, even if the rest of the assessment is incomplete.
    if (value !== undefined && item.flagAtOrAbove !== undefined && value >= item.flagAtOrAbove) {
      finish(next);
      return;
    }
    setAnswers(next);
    if (index + 1 >= assessment.items.length) finish(next);
    else setIndex(index + 1);
  };
  if (result) {
    const disposition = assessmentDisposition(assessment, result, state.safetyMode);
    if (disposition.showSafety) return <SafetyResult positive={result.flags.length > 0} activeSafety complete={result.complete} />;
    if (isSafety) return <SafetyResult positive={false} complete={result.complete} />;
    const saveResult = () => {
      if (disposition.saveResult) dispatch({ type: 'saveResult', assessmentId: assessment.id, result });
    };
    return <Result assessment={assessment} result={result} onDone={() => { saveResult(); router.back(); }} onSelect={(id) => {
      saveResult();
      router.replace(`/activity/${id}`);
    }} />;
  }
  if (index < 0) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{assessment.title}</ThemedText>
        {isSafety ? (
          <>
            <ThemedText themeColor="textSecondary">{assessment.intro}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Answer on your own if it is safe to do so. You may skip any question or stop at any time.
              Answers from this check are not saved. Safety mode and completion status are stored on this device,
              so someone with access to it may notice changes.
            </ThemedText>
          </>
        ) : (
          <>
            <ThemedText themeColor="textSecondary">{assessment.intro}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Results are stored on this device without an app lock. Anyone with access to the device may see them.
              You can skip questions or stop at any time.
            </ThemedText>
          </>
        )}
        <ThemedText type="small" themeColor="textSecondary">{assessment.items.length} questions · about {assessment.minutes} min</ThemedText>
        <Button label="Start" onPress={() => setIndex(0)} />
        {isSafety && <Button label="Skip check for now" variant="secondary" onPress={() => finish({})} />}
        <Button label="Stop" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  const item = assessment.items[index]!;
  const { min, labels } = assessment.scale;
  return (
    <View style={styles.gap}>
      <ProgressBar value={index / assessment.items.length} />
      <ThemedText type="small" themeColor="textSecondary">Question {index + 1} of {assessment.items.length}</ThemedText>
      <ThemedText type="subtitle">{item.text}</ThemedText>
      <View style={styles.options}>
        {labels.map((label, i) => (
          <Option key={`${label}-${i}`} label={label} selected={answers[item.id] === min + i} onPress={() => answer(min + i)} />
        ))}
      </View>
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
        <Button label="Skip question" variant="secondary" onPress={() => answer(undefined)} />
      </View>
      <Button label="Stop and see support" variant="secondary" onPress={() => router.replace('/safety')} />
    </View>
  );
}

function SafetyResult({ positive, complete, activeSafety = false }: { positive: boolean; complete: boolean; activeSafety?: boolean }) {
  return (
    <View style={styles.gap}>
      <ThemedText type="title">{positive ? 'Your safety matters' : 'Thank you'}</ThemedText>
      {positive ? (
        <>
          <ThemedText>Some answers suggest you may not feel safe. You are not alone, and it is not your fault.</ThemedText>
          <ThemedText themeColor="textSecondary">
            Relationship activities have been paused. Consider individual support from a domestic violence advocate;
            you do not need to start a conversation with your partner. You can stop here.
          </ThemedText>
        </>
      ) : activeSafety ? (
        <ThemedText themeColor="textSecondary">Safety mode is already on and relationship activities remain paused. This check cannot determine whether a relationship is safe. Individual support is available.</ThemedText>
      ) : (
        <ThemedText themeColor="textSecondary">
          {complete
            ? 'This check cannot determine whether a relationship is safe. You can seek support or retake the check at any time.'
            : 'Some or all questions were skipped. This check cannot determine whether a relationship is safe. Relationship activities may remain unavailable until the check is complete. You can seek support or retake it at any time.'}
        </ThemedText>
      )}
      <Button label="See individual support options" variant="safety" onPress={() => router.replace('/safety')} />
      <Button label="Continue" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}

function Result({ assessment, result, onDone, onSelect }: { assessment: Assessment; result: AssessmentResult; onDone: () => void; onSelect: (id: string) => void }) {
  const recs = result.complete ? result.recommendations.map(getActivity).filter((a) => a !== undefined).slice(0, 4) : [];
  return (
    <View style={styles.gap}>
      <ThemedText type="small" themeColor="textSecondary">{assessment.title}</ThemedText>
      {!result.complete ? (
        <>
          <ThemedText type="title">Assessment incomplete</ThemedText>
          <ThemedText>Some questions were skipped. No overall profile or recommendations are available from these partial answers. You can retake the assessment when you wish.</ThemedText>
        </>
      ) : (
        <>
          <ThemedText type="title">{result.band?.label ?? 'Results'}</ThemedText>
          {result.band && <ThemedText>{result.band.narrative}</ThemedText>}
          <Section title="Areas (higher = more strain)">
            {result.subscales.filter((s) => s.score !== null).map((s) => (
              <View key={s.id} style={styles.bar}>
                <ThemedText type="small">{s.label}</ThemedText>
                <ProgressBar value={(s.score ?? 0) / 100} />
              </View>
            ))}
          </Section>
          {recs.length > 0 && (
            <Section title="Suggested next">
              {recs.map((a) => (
                <Card key={a.id} onPress={() => onSelect(a.id)}>
                  <ThemedText type="smallBold">{a.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{a.summary}</ThemedText>
                </Card>
              ))}
            </Section>
          )}
        </>
      )}
      <ThemedText type="small" themeColor="textSecondary">This is a reflection tool, not a diagnosis. Selecting a suggestion or Done saves the result on this device.</ThemedText>
      <Button label="Done" onPress={onDone} />
    </View>
  );
}
const styles = StyleSheet.create({
  gap: { gap: 16 }, options: { gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }, bar: { gap: 4 },
});
