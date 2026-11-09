import type { Exercise, ExerciseStep } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Option, ProgressBar } from '@/components/ui';
import { useStore } from '@/state/store';

import { Timer } from './timer';

type Value = string | string[] | undefined;

export function ExercisePlayer({ exercise }: { exercise: Exercise }) {
  const { state, dispatch } = useStore();
  const saved = (state.progress[exercise.id]?.data ?? {}) as Record<string, Value>;
  const [index, setIndex] = useState(-1);
  const [data, setData] = useState<Record<string, Value>>(saved);

  const save = (completed: boolean, next = data) =>
    dispatch({ type: 'saveProgress', activityId: exercise.id, data: next, completed });

  if (index < 0) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{exercise.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{exercise.intro}</ThemedText>
        <Button label={Object.keys(saved).length ? 'Continue' : 'Start'} onPress={() => setIndex(0)} />
      </View>
    );
  }

  if (index >= exercise.steps.length) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">Nice work</ThemedText>
        {exercise.outro && <ThemedText themeColor="textSecondary">{exercise.outro}</ThemedText>}
        <ThemedText type="small" themeColor="textSecondary">
          Saved privately on this device.
        </ThemedText>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    );
  }

  const step = exercise.steps[index]!;
  const set = (v: Value) => setData({ ...data, [step.id]: v });
  const next = () => {
    const isLast = index + 1 >= exercise.steps.length;
    save(isLast);
    setIndex(index + 1);
  };

  return (
    <View style={styles.gap}>
      <ProgressBar value={(index + 1) / exercise.steps.length} />
      <ThemedText type="subtitle">{step.prompt}</ThemedText>
      {step.help && (
        <ThemedText type="small" themeColor="textSecondary">
          {step.help}
        </ThemedText>
      )}
      <StepInput key={step.id} step={step} value={data[step.id]} onChange={set} />
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
        <Button label={index + 1 >= exercise.steps.length ? 'Finish' : 'Next'} onPress={next} />
      </View>
    </View>
  );
}

function StepInput({ step, value, onChange }: { step: ExerciseStep; value: Value; onChange: (v: Value) => void }) {
  const [draft, setDraft] = useState('');
  switch (step.kind) {
    case 'instruction':
      return null;
    case 'timer':
      return <Timer key={step.id} seconds={step.seconds ?? 60} />;
    case 'text':
      return <Input multiline value={typeof value === 'string' ? value : ''} onChangeText={onChange} placeholder="Write here…" />;
    case 'choice':
    case 'scale':
      return (
        <View style={styles.options}>
          {(step.options ?? []).map((o) => (
            <Option key={o} label={o} selected={value === o} onPress={() => onChange(o)} />
          ))}
        </View>
      );
    case 'multi': {
      const list = Array.isArray(value) ? value : [];
      return (
        <View style={styles.options}>
          {(step.options ?? []).map((o) => (
            <Option
              key={o}
              label={o}
              selected={list.includes(o)}
              onPress={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])}
            />
          ))}
        </View>
      );
    }
    case 'list': {
      const list = Array.isArray(value) ? value : [];
      const add = () => {
        if (!draft.trim()) return;
        onChange([...list, draft.trim()]);
        setDraft('');
      };
      return (
        <View style={styles.options}>
          {list.map((item, i) => (
            <Card key={`${item}-${i}`}>
              <View style={styles.listRow}>
                <ThemedText type="small" style={styles.flex}>
                  {item}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" onPress={() => onChange(list.filter((_, j) => j !== i))}>
                  Remove
                </ThemedText>
              </View>
            </Card>
          ))}
          <Input value={draft} onChangeText={setDraft} placeholder="Add an item" onSubmitEditing={add} returnKeyType="done" />
          <Button label="Add" variant="secondary" onPress={add} disabled={!draft.trim()} />
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  options: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
