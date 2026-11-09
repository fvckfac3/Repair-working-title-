import { rankModules } from '@repair/scoring';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DailyCheckin } from '@/features/checkin';
import { nextActivityFor } from '@/features/recommend';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Pill, Screen, Section } from '@/components/ui';
import {
  getModule,
  hiddenInSafetyMode,
  onboardingAssessment,
  safetyScreen,
  weeklyConversationId,
} from '@/content';
import { latestResult, useStore } from '@/state/store';

export default function TodayScreen() {
  const { state } = useStore();
  const onboarding = latestResult(state, onboardingAssessment.id);

  if (!state.safetyScreenDone) {
    return (
      <Screen padTop>
        <Header />
        <Card tone="accent">
          <ThemedText type="subtitle">Welcome. We're glad you're here.</ThemedText>
          <ThemedText themeColor="textSecondary">
            Repair is for couples going through a hard season. First, a short private check that
            this app is a safe fit for you right now. Your partner will never see it.
          </ThemedText>
          <Button label="Start the private check" onPress={() => router.push(`/activity/${safetyScreen.id}`)} />
        </Card>
      </Screen>
    );
  }

  if (!onboarding) {
    return (
      <Screen padTop>
        <Header />
        <Card tone="accent">
          <ThemedText type="subtitle">{onboardingAssessment.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{onboardingAssessment.summary}</ThemedText>
          <Pill label={`${onboardingAssessment.minutes} min · private`} />
          <Button label="Begin" onPress={() => router.push(`/activity/${onboardingAssessment.id}`)} />
        </Card>
        {state.safetyMode && <SafetyCard />}
      </Screen>
    );
  }

  const distressed = (onboarding.result.overall ?? 0) >= 60;
  const path = rankModules([onboarding.result], {
    safetyMode: state.safetyMode,
    hiddenInSafetyMode,
    pinFirst: distressed ? ['calming-the-storm'] : [],
  })
    .map((r) => getModule(r.module))
    .filter((m) => m !== undefined)
    .slice(0, 3);

  const next = path.map((m) => nextActivityFor(m.slug, state)).find((a) => a !== undefined);

  return (
    <Screen padTop>
      <Header />
      {state.safetyMode && <SafetyCard />}

      {next && (
        <Card tone="accent" onPress={() => router.push(`/activity/${next.id}`)}>
          <ThemedText type="smallBold" themeColor="accent">
            TODAY'S STEP
          </ThemedText>
          <ThemedText type="subtitle">{next.title}</ThemedText>
          <ThemedText themeColor="textSecondary">{next.summary}</ThemedText>
          <Pill label={`${next.minutes} min · ${next.mode === 'together' ? 'together' : 'on your own'}`} />
        </Card>
      )}

      <DailyCheckin />

      <Section title="Your path">
        {onboarding.result.suggestTherapist && (
          <Card>
            <ThemedText type="smallBold">Consider extra support</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your answers suggest things are very hard right now. Repair works best alongside a
              couples therapist.
            </ThemedText>
            <Button label="Find support" variant="secondary" onPress={() => router.push('/safety')} />
          </Card>
        )}
        {path.map((m, i) => (
          <Card key={m.slug} onPress={() => router.push(`/module/${m.slug}`)}>
            <ThemedText type="small" themeColor="textSecondary">
              Step {i + 1}
            </ThemedText>
            <ThemedText type="smallBold">{m.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {m.tagline}
            </ThemedText>
          </Card>
        ))}
      </Section>

      {!state.safetyMode && (
        <Section title="This week">
          <Card onPress={() => router.push(`/activity/${weeklyConversationId}`)}>
            <ThemedText type="smallBold">State of Us</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Your 15-minute weekly check-in together.
            </ThemedText>
          </Card>
        </Section>
      )}
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <ThemedText type="title">Today</ThemedText>
    </View>
  );
}

function SafetyCard() {
  return (
    <Card tone="safety" onPress={() => router.push('/safety')}>
      <ThemedText type="smallBold" themeColor="safety">
        Support is available
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Confidential help, any time. Only you can see this.
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: 8 },
});
