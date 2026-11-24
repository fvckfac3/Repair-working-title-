import { rankModules } from '@repair/scoring';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DailyCheckin } from '@/features/checkin';
import { moduleProgress, nextActivityFor } from '@/features/recommend';
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

  if (state.safetyMode) {
    return (
      <Screen padTop>
        <Header />
        <Card tone="safety">
          <ThemedText type="subtitle">Your safety matters</ThemedText>
          <ThemedText themeColor="textSecondary">
            Relationship activities are paused. You can explore individual support options without using the app's activities.
          </ThemedText>
          <Button label="Safety & Support" onPress={() => router.push('/safety')} />
        </Card>
      </Screen>
    );
  }

  if (!state.safetyScreenDone) {
    return (
      <Screen padTop>
        <Header />
        <Card tone="accent">
          <ThemedText type="subtitle">Welcome. We're glad you're here.</ThemedText>
          <ThemedText themeColor="textSecondary">
            Start with a draft check for possible safety concerns. It cannot determine whether this app is safe for you.
            Answers are stored unencrypted on this device and can be seen by someone with access to it.
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
      </Screen>
    );
  }

  const distressed = onboarding.result.complete && (onboarding.result.overall ?? 0) >= 60;
  const ranked = rankModules([onboarding.result], {
    safetyMode: state.safetyMode,
    hiddenInSafetyMode,
    pinFirst: distressed ? ['calming-the-storm'] : [],
  }).map((r) => getModule(r.module)).filter((m) => m !== undefined);
  const path = ranked.slice(0, 3);
  const next = ranked.map((m) => nextActivityFor(m.slug, state)).find((a) => a !== undefined);
  const nextModule = next && getModule(next.module);
  const modeLabel = next?.mode === 'together' ? 'together' : next?.mode === 'either' ? 'solo or together' : 'on your own';

  return (
    <Screen padTop>
      <Header />
      <ThemedText type="small" themeColor="textSecondary">
        Preview content may not have been clinically reviewed. Repair is not therapy or a crisis service.
      </ThemedText>
      {next ? (
        <Card tone="accent" onPress={() => router.push(`/activity/${next.id}`)} accessibilityHint="Opens this activity">
          <ThemedText type="smallBold" themeColor="accent">TODAY'S STEP</ThemedText>
          <ThemedText type="subtitle">{next.title}</ThemedText>
          {nextModule && <ThemedText type="small" themeColor="textSecondary">From {nextModule.title}</ThemedText>}
          <ThemedText themeColor="textSecondary">{next.summary}</ThemedText>
          <Pill label={`${next.minutes} min · ${modeLabel}`} />
        </Card>
      ) : (
        <Card tone="accent">
          <ThemedText type="smallBold">Explore at your own pace</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {ranked.length
              ? 'There is no suggested step available right now. Modules may be coming soon, complete, or have entry requirements.'
              : 'There is no personalized path to show right now. You can explore the library or take the check again.'}
          </ThemedText>
          <Button label="Browse the library" onPress={() => router.push('/library')} />
        </Card>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Daily check-in answers stay on this device; sharing is not available in this prototype.
      </ThemedText>
      <DailyCheckin />

      {onboarding.result.complete && onboarding.result.suggestTherapist && (
        <Card>
          <ThemedText type="smallBold">Consider extra support</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {state.safetyMode
              ? 'You can explore confidential support options and decide what feels right for you.'
              : 'Your answers suggest things are very hard right now. Repair can be used alongside professional support.'}
          </ThemedText>
          <Button label="Find support" variant="secondary" onPress={() => router.push('/safety')} />
        </Card>
      )}
      <Section title={path.length ? 'Your suggested areas' : 'Your path'}>
        {!path.length ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              {!onboarding.result.complete
                ? 'Your latest check was incomplete, so it cannot suggest a path. You can take it again when you are ready.'
                : 'No suggested areas are available from this check. You can browse the library instead.'}
            </ThemedText>
            {!onboarding.result.complete && (
              <Button label="Take the check again" variant="secondary" onPress={() => router.push(`/activity/${onboardingAssessment.id}`)} />
            )}
          </Card>
        ) : path.map((m) => {
          const { completed, total } = moduleProgress(m.slug, state);
          return (
            <Card key={m.slug} onPress={() => router.push(`/module/${m.slug}`)} accessibilityHint="Opens the module">
              <ThemedText type="smallBold">{m.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{m.tagline}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {m.status === 'draft' ? 'Coming soon' : total > 0
                  ? `${completed} of ${total} ${state.safetyMode ? 'solo ' : ''}activities completed`
                  : 'No activities available right now'}
              </ThemedText>
            </Card>
          );
        })}
      </Section>

      {!state.safetyMode && (
        <Section title="This week">
          <Card onPress={() => router.push(`/activity/${weeklyConversationId}`)} accessibilityHint="Opens the weekly conversation">
            <ThemedText type="smallBold">State of Us</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Your 15-minute weekly check-in together.</ThemedText>
          </Card>
        </Section>
      )}
    </Screen>
  );
}

function Header() {
  return <View style={styles.header}><ThemedText type="title">Today</ThemedText></View>;
}

const styles = StyleSheet.create({ header: { paddingTop: 8 } });
