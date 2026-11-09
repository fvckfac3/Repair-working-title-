import type { Activity, ActivityType } from '@repair/content-schema';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Option, Pill, Screen, Section } from '@/components/ui';
import { activitiesFor, getModule, isHiddenForSafety, TYPE_LABELS } from '@/content';
import { useStore } from '@/state/store';

const SECTIONS: { type: ActivityType; title: string; outlineKey?: 'lessons' | 'exercises' | 'conversations' }[] = [
  { type: 'assessment', title: 'Assess' },
  { type: 'lesson', title: 'Understand', outlineKey: 'lessons' },
  { type: 'exercise', title: 'Practice', outlineKey: 'exercises' },
  { type: 'conversation', title: 'Talk', outlineKey: 'conversations' },
  { type: 'journal', title: 'Reflect' },
  { type: 'ritual', title: 'Make it a habit' },
];

export default function ModuleScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const mod = getModule(slug);
  const { state, dispatch } = useStore();
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (!mod) {
    return (
      <Screen>
        <ThemedText>Module not found.</ThemedText>
      </Screen>
    );
  }

  const needsAdult = mod.gating.adultsOnly && !state.adultConfirmed;
  const needsGate = mod.gating.confirmations.length > 0 && !state.gatesAccepted[mod.slug];
  const all = activitiesFor(mod.slug);

  return (
    <Screen>
      <Stack.Screen options={{ title: mod.title }} />
      <ThemedText type="title">{mod.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{mod.description}</ThemedText>
      <View style={styles.pills}>
        <Pill label={`${mod.intensity} intensity`} />
        {mod.status === 'draft' && <Pill label="Coming soon" />}
        {mod.status === 'in_review' && <Pill label="Early access · in clinical review" />}
      </View>

      {mod.gating.therapistRecommended && (
        <Card>
          <ThemedText type="small">
            We strongly recommend working through this module with a couples therapist alongside the app.
          </ThemedText>
          <Button label="Find a therapist" variant="secondary" onPress={() => router.push('/safety')} />
        </Card>
      )}

      {needsAdult ? (
        <Card tone="accent">
          <ThemedText type="smallBold">This module is for adults only.</ThemedText>
          <Button label="I confirm I'm 18 or older" onPress={() => dispatch({ type: 'confirmAdult' })} />
        </Card>
      ) : needsGate ? (
        <Card tone="accent">
          <ThemedText type="smallBold">Before you begin, privately confirm:</ThemedText>
          {mod.gating.confirmations.map((c, i) => (
            <Option key={c} label={`${checked[i] ? '☑' : '☐'}  ${c}`} selected={!!checked[i]} onPress={() => setChecked({ ...checked, [i]: !checked[i] })} />
          ))}
          <Button
            label="Continue"
            disabled={!mod.gating.confirmations.every((_, i) => checked[i])}
            onPress={() => dispatch({ type: 'acceptGate', module: mod.slug })}
          />
        </Card>
      ) : (
        SECTIONS.map(({ type, title, outlineKey }) => {
          const authored = all.filter((a) => a.type === type);
          const planned = outlinePlanned(mod.outline, type, outlineKey, authored);
          if (!authored.length && !planned.length) return null;
          return (
            <Section key={type} title={title}>
              {authored.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
              {planned.map((t) => (
                <Card key={t} style={styles.planned}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {TYPE_LABELS[type]} · {t}, coming soon
                  </ThemedText>
                </Card>
              ))}
            </Section>
          );
        })
      )}
    </Screen>
  );
}

function outlinePlanned(
  outline: NonNullable<ReturnType<typeof getModule>>['outline'],
  type: ActivityType,
  key: 'lessons' | 'exercises' | 'conversations' | undefined,
  authored: Activity[],
): string[] {
  if (authored.length) return [];
  if (key) return outline[key];
  if (type === 'assessment') return [outline.assessment];
  if (type === 'journal' && outline.journal) return [outline.journal];
  if (type === 'ritual' && outline.ritual) return [outline.ritual];
  return [];
}

function ActivityRow({ activity: a }: { activity: Activity }) {
  const { state } = useStore();
  const done = a.type === 'assessment' ? !!state.results[a.id]?.length : state.progress[a.id]?.status === 'completed';
  const hidden = state.safetyMode && isHiddenForSafety(a);
  return (
    <Card onPress={hidden ? undefined : () => router.push(`/activity/${a.id}`)} style={hidden ? styles.planned : undefined}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.flex}>
          {a.title}
        </ThemedText>
        {done && <ThemedText themeColor="success">✓</ThemedText>}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {hidden ? 'Paused for now' : a.summary}
      </ThemedText>
      <Pill label={`${a.minutes} min · ${a.mode === 'together' ? 'together' : a.mode === 'solo' ? 'solo' : 'solo or together'}`} />
    </Card>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  planned: { opacity: 0.55 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});
