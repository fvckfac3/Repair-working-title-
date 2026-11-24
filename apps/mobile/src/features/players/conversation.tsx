import type { Conversation } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, ProgressBar, Section } from '@/components/ui';
import { useStore } from '@/state/store';
import { savedStep } from './player-logic';
import { Timer } from './timer';
const BREAK_SECONDS = 20 * 60;

/** A guide on one device; no partner synchronization. */
export function ConversationPlayer({ conversation }: { conversation: Conversation }) {
  const { state, dispatch } = useStore();
  const progress = state.progress[conversation.id];
  const [index, setIndex] = useState(-1);
  const [onBreak, setOnBreak] = useState(false);
  const phases = conversation.phases;
  const save = (at: number, completed = false) => dispatch({
    type: 'saveProgress', activityId: conversation.id, data: { pausedAt: at, conversationActive: !completed }, completed,
  });
  const goTo = (at: number) => { save(at); setIndex(at); };
  const stop = () => { save(index); router.back(); };
  if (onBreak) {
    return (
      <View style={styles.gap}>
        <ThemedText type="title">Taking a break</ThemedText>
        <ThemedText>
          If safe and possible, take time apart to settle. You can use the optional 20-minute timer,
          take longer, or stop entirely. You never have to resume a conversation that feels unsafe.
        </ThemedText>
        <Timer key="break" seconds={BREAK_SECONDS} />
        <Button label="Return to guide" onPress={() => setOnBreak(false)} />
        <Button label="Stop and save place" variant="secondary" onPress={stop} />
      </View>
    );
  }
  if (index < 0) {
    const hasPlace = progress?.status === 'started' || progress?.data.conversationActive === true;
    return (
      <View style={styles.gap}>
        <ThemedText type="title">{conversation.title}</ThemedText>
        <ThemedText themeColor="textSecondary">{conversation.intro}</ThemedText>
        <Section title="Ground rules">
          {conversation.groundRules.map((r, i) => <ThemedText key={`${r}-${i}`} type="small">• {r}</ThemedText>)}
        </Section>
        <ThemedText type="small" themeColor="textSecondary">
          This guide uses one device. Either person can stop or skip a phase at any time.
          Decide who will be Partner A (speaks first) and who is Partner B.
        </ThemedText>
        {hasPlace && <Button label="Continue from saved place" onPress={() => goTo(savedStep(progress.data.pausedAt, phases.length))} />}
        <Button label={hasPlace ? 'Start over' : 'Start'} variant={hasPlace ? 'secondary' : 'primary'} onPress={() => goTo(0)} />
        <Button label="Stop" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }
  const phase = phases[index]!;
  const isLast = index + 1 >= phases.length;
  const heading = phase.kind === 'turn' && phase.speaker
    ? `Partner ${phase.speaker} speaks · Partner ${phase.speaker === 'A' ? 'B' : 'A'} listens`
    : phase.kind === 'close' ? 'Together, to close' : 'Together';
  return (
    <View style={styles.gap}>
      <ProgressBar value={(index + 1) / phases.length} />
      <ThemedText type="small" themeColor="textSecondary">Phase {index + 1} of {phases.length}</ThemedText>
      <ThemedText type="small" themeColor="accent">{heading.toUpperCase()}</ThemedText>
      <ThemedText type="subtitle">{phase.title}</ThemedText>
      <Card>{phase.prompts.map((p, i) => <ThemedText key={`${p}-${i}`}>{p}</ThemedText>)}</Card>
      {phase.listenerPrompts.length > 0 && (
        <Card><ThemedText type="smallBold">Listener</ThemedText>
          {phase.listenerPrompts.map((p, i) => <ThemedText key={`${p}-${i}`} type="small" themeColor="textSecondary">{p}</ThemedText>)}
        </Card>
      )}
      {phase.seconds && <Timer key={phase.id} seconds={phase.seconds} />}
      <View style={styles.row}>
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => goTo(index - 1)} />}
        <Button label={isLast ? 'Finish' : 'Next / skip'} onPress={() => {
          if (isLast) { save(0, true); router.back(); } else goTo(index + 1);
        }} />
      </View>
      <Button label="Take a break" variant="secondary" onPress={() => { save(index); setOnBreak(true); }} />
      <Button label="Stop and save place" variant="secondary" onPress={stop} />
    </View>
  );
}
const styles = StyleSheet.create({ gap: { gap: 16 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' } });
