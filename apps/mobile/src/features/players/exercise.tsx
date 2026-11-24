import type { Exercise, ExerciseStep } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Option, ProgressBar } from '@/components/ui';
import { useStore } from '@/state/store';
import { savedStep } from './player-logic';
import { Timer } from './timer';

type Value = string | string[] | undefined;
export function ExercisePlayer({ exercise }: { exercise: Exercise }) {
  const { state, dispatch } = useStore();
  const progress = state.progress[exercise.id];
  const saved = progress?.data ?? {};
  const [index, setIndex] = useState(-1);
  const [data, setData] = useState<Record<string, Value>>(() => Object.fromEntries(
    exercise.steps.map((s) => [s.id, typeof saved[s.id] === 'string' || Array.isArray(saved[s.id]) ? saved[s.id] as Value : undefined]),
  ));
  const [draft, setDraft] = useState(typeof saved._draft === 'string' ? saved._draft : '');
  const persist = (values: Record<string, Value>, at: number, pending: string, completed = false) => {
    dispatch({ type: 'saveProgress', activityId: exercise.id, data: { ...values, _stepIndex: at, _draft: pending }, completed });
  };
  if (index < 0) {
    const hasProgress = !!progress;
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{exercise.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{exercise.intro}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Responses and your place are stored on this device as you work. Anyone with access to the device may see them. The app does not send responses to a partner. You can skip a step or stop at any time.
        </ThemedText>
        <Button label={hasProgress ? 'Continue / review' : 'Start'} onPress={() => setIndex(savedStep(saved._stepIndex, exercise.steps.length))} />
      </View>
    );
  }
  if (index >= exercise.steps.length) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">Exercise complete</ThemedText>
        {exercise.outro && <ThemedText themeColor="textSecondary">{exercise.outro}</ThemedText>}
        <ThemedText themeColor="textSecondary">Your responses are stored on this device. Open this exercise again to review them.</ThemedText>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    );
  }
  const step = exercise.steps[index]!;
  const set = (v: Value) => {
    const next = { ...data, [step.id]: v };
    setData(next);
    persist(next, index, draft);
  };
  const updateDraft = (v: string) => { setDraft(v); persist(data, index, v); };
  const addDraft = () => {
    if (!draft.trim()) return;
    const list = Array.isArray(data[step.id]) ? data[step.id] as string[] : [];
    const next = { ...data, [step.id]: [...list, draft.trim()] };
    setData(next); setDraft(''); persist(next, index, '');
  };
  const move = (at: number, completed = false, close = false) => {
    // Include a typed list item even if the user leaves without tapping Add.
    const list = Array.isArray(data[step.id]) ? data[step.id] as string[] : [];
    const next = step.kind === 'list' && draft.trim() ? { ...data, [step.id]: [...list, draft.trim()] } : data;
    setData(next); setDraft('');
    persist(next, completed ? 0 : at, '', completed);
    if (close) router.back(); else setIndex(at);
  };
  return (
    <View style={styles.gap}>
      <ProgressBar value={(index + 1) / exercise.steps.length} />
      <ThemedText type="small" themeColor="textSecondary">Step {index + 1} of {exercise.steps.length}</ThemedText>
      <ThemedText type="subtitle">{step.prompt}</ThemedText>
      {step.help && <ThemedText type="small" themeColor="textSecondary">{step.help}</ThemedText>}
      <StepInput key={step.id} step={step} value={data[step.id]} onChange={set} draft={draft} onDraft={updateDraft} onAdd={addDraft} />
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => move(index - 1)} />}
        <Button label={index + 1 >= exercise.steps.length ? 'Finish' : 'Next / skip'} onPress={() => move(index + 1, index + 1 >= exercise.steps.length)} />
      </View>
      <Button label="Stop and save place" variant="secondary" onPress={() => move(index, false, true)} />
    </View>
  );
}
function StepInput({ step, value, onChange, draft, onDraft, onAdd }: {
  step: ExerciseStep; value: Value; onChange: (v: Value) => void; draft: string; onDraft: (v: string) => void; onAdd: () => void;
}) {
  switch (step.kind) {
    case 'instruction': return null;
    case 'timer': return <Timer key={step.id} seconds={step.seconds ?? 60} />;
    case 'text': return <Input multiline accessibilityLabel={step.prompt} value={typeof value === 'string' ? value : ''} onChangeText={onChange} placeholder="Write here…" />;
    case 'choice':
    case 'scale': return <View style={styles.options}>{(step.options ?? []).map((o) => <Option key={o} label={o} selected={value === o} onPress={() => onChange(o)} />)}</View>;
    case 'multi': {
      const list = Array.isArray(value) ? value : [];
      return <View style={styles.options}>{(step.options ?? []).map((o) => <Option key={o} label={o} selected={list.includes(o)} onPress={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} />)}</View>;
    }
    case 'list': {
      const list = Array.isArray(value) ? value : [];
      return (
        <View style={styles.options}>
          {list.map((item, i) => (
            <Card key={`${item}-${i}`}>
              <ThemedText type="small">{item}</ThemedText>
              <Button label={`Remove item ${i + 1}`} variant="secondary" onPress={() => onChange(list.filter((_, j) => j !== i))} />
            </Card>
          ))}
          <Input accessibilityLabel={`${step.prompt}: new item`} value={draft} onChangeText={onDraft} placeholder="Add an item" onSubmitEditing={onAdd} returnKeyType="done" />
          <Button label="Add item" variant="secondary" onPress={onAdd} disabled={!draft.trim()} />
        </View>
      );
    }
  }
}
const styles = StyleSheet.create({ gap: { gap: 16 }, options: { gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' } });
