import type { Activity, ActivityType, Module, Tier } from '@repair/content-schema';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Option, Pill, ProgressBar, Screen, Section } from '@/components/ui';
import { content, TIER_LABELS, TYPE_LABELS } from '@/content';
import { filterLibrary, moduleProgress, type LibraryFilters } from '@/features/recommend';
import { useStore } from '@/state/store';

const TIERS: Tier[] = ['A', 'B', 'C', 'D'];
const TYPES: ActivityType[] = ['assessment', 'lesson', 'exercise', 'conversation', 'journal', 'ritual'];

export default function LibraryScreen() {
  const { state } = useStore();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<LibraryFilters['type']>('all');
  const [mode, setMode] = useState<LibraryFilters['mode']>('all');
  // A previously selected together filter must not remain active in safety mode.
  const effectiveMode = state.safetyMode && mode === 'together' ? 'all' : mode;
  const active = Boolean(query.trim()) || type !== 'all' || effectiveMode !== 'all';
  const matches = useMemo(
    () => filterLibrary(content.modules, content.activities, { query, type, mode: effectiveMode, safetyMode: state.safetyMode }),
    [query, type, effectiveMode, state.safetyMode],
  );
  const clear = () => {
    setQuery('');
    setType('all');
    setMode('all');
  };

  if (state.safetyMode) {
    return (
      <Screen padTop>
        <ThemedText type="title">Library</ThemedText>
        <Card tone="safety">
          <ThemedText type="smallBold">Activities are paused</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Relationship activities are paused while safety mode is on. Support is available without using them.
          </ThemedText>
          <Button label="Safety & Support" onPress={() => router.push('/safety')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen padTop>
      <ThemedText type="title">Library</ThemedText>
      <ThemedText themeColor="textSecondary">
        Find a module or an activity for what you're facing. Some modules are still coming soon.
      </ThemedText>
      <View style={styles.filters}>
        <ThemedText type="smallBold">Search the library</ThemedText>
        <Input
          accessibilityLabel="Search modules and activities"
          placeholder="Search by topic or activity"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <ThemedText type="smallBold">Activity type</ThemedText>
        <View style={styles.chips}>
          <Option compact label="All types" selected={type === 'all'} onPress={() => setType('all')} />
          {TYPES.map((item) => (
            <Option key={item} compact label={TYPE_LABELS[item]} selected={type === item} onPress={() => setType(item)} />
          ))}
        </View>
        <ThemedText type="smallBold">How to do it</ThemedText>
        <View style={styles.chips}>
          <Option compact label="Any mode" selected={effectiveMode === 'all'} onPress={() => setMode('all')} />
          <Option compact label="On my own" selected={effectiveMode === 'solo'} onPress={() => setMode('solo')} />
          {!state.safetyMode && (
            <Option compact label="Together" selected={effectiveMode === 'together'} onPress={() => setMode('together')} />
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Mode filters include activities that can be done either way.
        </ThemedText>
      </View>
      <View accessibilityLiveRegion="polite">
        <ThemedText type="small" themeColor="textSecondary">
          {matches.length} {matches.length === 1 ? 'module' : 'modules'} {active ? 'found' : 'available to explore'}
        </ThemedText>
      </View>
      {active && matches.length > 0 && <Button label="Clear search and filters" variant="secondary" onPress={clear} />}
      {matches.length === 0 ? (
        <Card>
          <ThemedText type="smallBold">No matches found</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Try another topic or remove a filter. Activity filters only include authored activities.
          </ThemedText>
          {active && <Button label="Clear search and filters" variant="secondary" onPress={clear} />}
        </Card>
      ) : (
        TIERS.map((tier) => {
          const inTier = matches.filter(({ module }) => module.tier === tier);
          if (!inTier.length) return null;
          return (
            <Section key={tier} title={TIER_LABELS[tier]}>
              {inTier.map(({ module, activities }) => (
                <View key={module.slug} style={styles.moduleGroup}>
                  <ModuleCard module={module} />
                  {active && activities.map((activity) => (
                    <ActivityCard key={activity.id} activity={activity} module={module} />
                  ))}
                </View>
              ))}
            </Section>
          );
        })
      )}
    </Screen>
  );
}

function ModuleCard({ module: m }: { module: Module }) {
  const { state } = useStore();
  const { completed, total } = moduleProgress(m.slug, state);
  const available = m.status !== 'draft';
  return (
    <Card onPress={() => router.push(`/module/${m.slug}`)} accessibilityHint="Opens the module">
      <View style={styles.titleRow}>
        <ThemedText type="smallBold" style={styles.title}>{m.title}</ThemedText>
        {!available && <Pill label="Coming soon" />}
        {m.status === 'in_review' && <Pill label="In review" />}
      </View>
      <ThemedText type="small" themeColor="textSecondary">{m.tagline}</ThemedText>
      {available && total > 0 && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {completed} of {total} {state.safetyMode ? 'solo ' : ''}activities completed
          </ThemedText>
          <ProgressBar value={completed / total} label={`${m.title} progress`} />
        </>
      )}
    </Card>
  );
}

function ActivityCard({ activity, module }: { activity: Activity; module: Module }) {
  const { state } = useStore();
  const needsGate = (module.gating.adultsOnly && !state.adultConfirmed)
    || (module.gating.confirmations.length > 0 && !state.gatesAccepted[module.slug]);
  const completed = activity.type === 'assessment'
    ? Boolean(state.results[activity.id]?.some(({ result }) => result.complete))
    : state.progress[activity.id]?.status === 'completed';
  const modeLabel = activity.mode === 'solo' ? 'solo' : activity.mode === 'together' ? 'together' : 'solo or together';
  return (
    <Card
      onPress={() => needsGate ? router.push(`/module/${module.slug}`) : router.push(`/activity/${activity.id}`)}
      accessibilityHint={needsGate ? 'Opens the module to review entry requirements' : 'Opens the activity'}
      style={styles.activity}>
      <ThemedText type="smallBold">{activity.title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{activity.summary}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {TYPE_LABELS[activity.type]} · {activity.minutes} min · {modeLabel}{completed ? ' · Completed' : ''}
      </ThemedText>
      {needsGate && <ThemedText type="small" themeColor="textSecondary">Open module to review entry requirements</ThemedText>}
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moduleGroup: { gap: 8 },
  activity: { marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
});
