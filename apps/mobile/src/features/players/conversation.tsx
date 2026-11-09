import type { Conversation } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ProgressBar, Section } from '@/components/ui';
import { useStore } from '@/state/store';

import { Timer } from './timer';

/** Recommended minimum break once someone is flooded. */
const BREAK_SECONDS = 20 * 60;

/**
 * Single-device conversation guide: the phone sits between you and is passed
 * back and forth. (Two-phone realtime sync uses conversation_sessions.)
 */
export function ConversationPlayer({ conversation }: { conversation: Conversation }) {
  const { dispatch } = useStore();
  const [index, setIndex] = useState(-1); // -1 = intro + ground rules
  const [onBreak, setOnBreak] = useState(false);
  const phases = conversation.phases;

  if (onBreak) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">Taking a break</ThemedText>
        <ThemedText>
          Good call. Spend at least 20 minutes apart doing something soothing. Don't replay the
          conversation. Come back when the timer ends, even if only to agree on a new time.
        </ThemedText>
        <Timer key="break" seconds={BREAK_SECONDS} />
        <Button label="We're ready to continue" onPress={() => setOnBreak(false)} />
        <Button
          label="End for today (we'll come back to it)"
          variant="secondary"
          onPress={() => {
            dispatch({ type: 'saveProgress', activityId: conversation.id, data: { pausedAt: index }, completed: false });
            router.back();
          }}
        />
      </View>
    );
  }

  if (index < 0) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{conversation.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{conversation.intro}</ThemedText>
        <Section title="Ground rules">
          {conversation.groundRules.map((r) => (
            <ThemedText key={r} type="small">
              • {r}
            </ThemedText>
          ))}
        </Section>
        <ThemedText type="small" themeColor="textSecondary">
          Decide who will be Partner A (speaks first) and who is Partner B.
        </ThemedText>
        <Button label="We're ready" onPress={() => setIndex(0)} />
      </View>
    );
  }

  const phase = phases[index]!;
  const isLast = index + 1 >= phases.length;
  const heading =
    phase.kind === 'turn'
      ? `Partner ${phase.speaker} speaks · Partner ${phase.speaker === 'A' ? 'B' : 'A'} listens`
      : phase.kind === 'close'
        ? 'Together, to close'
        : 'Together';

  return (
    <View style={styles.gap}>
      <ProgressBar value={(index + 1) / phases.length} />
      <ThemedText type="small" themeColor="accent">
        {heading.toUpperCase()}
      </ThemedText>
      <ThemedText type="subtitle">{phase.title}</ThemedText>
      <Card>
        {phase.prompts.map((p) => (
          <ThemedText key={p}>{p}</ThemedText>
        ))}
      </Card>
      {phase.listenerPrompts.length > 0 && (
        <Card>
          <ThemedText type="smallBold">Listener</ThemedText>
          {phase.listenerPrompts.map((p) => (
            <ThemedText key={p} type="small" themeColor="textSecondary">
              {p}
            </ThemedText>
          ))}
        </Card>
      )}
      {phase.seconds && <Timer key={phase.id} seconds={phase.seconds} />}
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
        <Button
          label={isLast ? 'Finish' : 'Next'}
          onPress={() => {
            if (isLast) {
              dispatch({ type: 'saveProgress', activityId: conversation.id, data: {}, completed: true });
              router.back();
            } else setIndex(index + 1);
          }}
        />
      </View>
      <Button label="Pause: one of us is flooded" variant="secondary" onPress={() => setOnBreak(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
});
