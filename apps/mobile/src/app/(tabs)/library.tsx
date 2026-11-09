import type { Module, Tier } from '@repair/content-schema';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Pill, ProgressBar, Screen, Section } from '@/components/ui';
import { content, hiddenInSafetyMode, TIER_LABELS } from '@/content';
import { moduleProgress } from '@/features/recommend';
import { useStore } from '@/state/store';

const TIERS: Tier[] = ['A', 'B', 'C', 'D'];

export default function LibraryScreen() {
  const { state } = useStore();
  const modules = content.modules.filter((m) => !(state.safetyMode && hiddenInSafetyMode.includes(m.slug)));

  return (
    <Screen padTop>
      <ThemedText type="title">Library</ThemedText>
      <ThemedText themeColor="textSecondary">
        Every activity lives inside a module. Start with the one that fits what you're facing.
      </ThemedText>
      {TIERS.map((tier) => {
        const inTier = modules.filter((m) => m.tier === tier);
        if (!inTier.length) return null;
        return (
          <Section key={tier} title={TIER_LABELS[tier]}>
            {inTier.map((m) => (
              <ModuleCard key={m.slug} module={m} />
            ))}
          </Section>
        );
      })}
    </Screen>
  );
}

function ModuleCard({ module: m }: { module: Module }) {
  const { state } = useStore();
  const { completed, total } = moduleProgress(m.slug, state);
  const available = m.status !== 'draft';
  return (
    <Card onPress={() => router.push(`/module/${m.slug}`)}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold" style={styles.title}>
          {m.title}
        </ThemedText>
        {!available && <Pill label="Coming soon" />}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {m.tagline}
      </ThemedText>
      {available && total > 0 && <ProgressBar value={completed / total} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
});
