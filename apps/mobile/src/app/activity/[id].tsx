import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, ProgressBar, Screen, Section } from '@/components/ui';
import { getActivity, getModule, isHiddenForSafety, safetyScreen } from '@/content';
import { AssessmentPlayer } from '@/features/players/assessment';
import { ConversationPlayer } from '@/features/players/conversation';
import { ExercisePlayer } from '@/features/players/exercise';
import { JournalPlayer } from '@/features/players/journal';
import { LessonPlayer } from '@/features/players/lesson';
import { RitualPlayer } from '@/features/players/ritual';
import { canOpenActivity } from '@/state/access';
import { latestResult, useStore } from '@/state/store';

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActivityContent key={id} id={id} />;
}

function ActivityContent({ id }: { id: string }) {
  const { state } = useStore();
  const activity = getActivity(id);
  // Capture only results created while this route is open; do not replace a
  // retake with a prior result or show the player's unsafe recommendation copy.
  const [initialCount] = useState(() => state.results[id]?.length ?? 0);

  if (!__DEV__ || !state.hydrated) return <Unavailable message="Activities are unavailable. Support is still available." />;
  if (!activity) return <Unavailable message="Activity not found." />;
  if (!state.safetyScreenDone && activity.id !== safetyScreen.id) {
    return (
      <Screen>
        <ThemedText type="subtitle">Start with the safety check</ThemedText>
        <ThemedText themeColor="textSecondary">This draft check cannot determine whether an activity is safe. Support is available without taking it.</ThemedText>
        <Button label="Start the check" onPress={() => router.replace(`/activity/${safetyScreen.id}`)} />
        <Button label="Safety & Support" variant="secondary" onPress={() => router.replace('/safety')} />
      </Screen>
    );
  }

  const saved = activity.type === 'assessment' && (state.results[id]?.length ?? 0) > initialCount
    ? latestResult(state, id) : undefined;
  // Do not show standard result narratives or recommendations when flagged:
  // some encourage joint work and are not safe in the presence of coercion.
  if (saved) {
    const positive = saved.result.flags.length > 0;
    return (
      <Screen>
        <ThemedText type="title">Check complete</ThemedText>
        {positive ? (
          <Card tone="safety">
            <ThemedText type="smallBold">Your safety matters</ThemedText>
            <ThemedText>Some answers may indicate a safety concern. Relationship activities are paused. An individual support service can help you explore options.</ThemedText>
          </Card>
        ) : !saved.result.complete ? (
          <ThemedText>Some questions were skipped. No overall profile or recommendations are available from partial answers.</ThemedText>
        ) : (
          <ThemedText>This is a draft reflection tool, not a diagnosis or a determination that a relationship is safe.</ThemedText>
        )}
        {activity.type === 'assessment' && activity.kind !== 'safety' && !positive && saved.result.complete && (
          <Section title="Areas of reflection">
            {saved.result.subscales.filter((s) => s.score !== null).map((s) => (
              <Card key={s.id}>
                <ThemedText type="small">{s.label} · {s.score}/100</ThemedText>
                <ProgressBar value={(s.score ?? 0) / 100} />
              </Card>
            ))}
          </Section>
        )}
        <Button label="Safety & Support" variant={positive ? 'safety' : 'secondary'} onPress={() => router.replace('/safety')} />
        {!state.safetyMode && <Button label="Continue" onPress={() => router.replace('/')} />}
      </Screen>
    );
  }

  const mod = getModule(activity.module);
  if (state.safetyMode && activity.id !== safetyScreen.id) {
    return (
      <Screen>
        <Card tone="safety">
          <ThemedText type="smallBold">Your safety matters</ThemedText>
          <ThemedText>Relationship activities are paused. You can consider individual support without involving a partner.</ThemedText>
        </Card>
        <Button label="See individual support options" variant="safety" onPress={() => router.replace('/safety')} />
      </Screen>
    );
  }
  const blocked = !canOpenActivity(state, activity.id, safetyScreen.id, isHiddenForSafety(activity)) ||
    (mod?.gating.adultsOnly && !state.adultConfirmed) ||
    (mod && mod.gating.confirmations.length > 0 && !state.gatesAccepted[mod.slug]);
  if (blocked) return <Unavailable message="This activity is paused or requires a module confirmation. Support is available." />;

  return (
    <Screen>
      {activity.id === safetyScreen.id && (
        <Card>
          <ThemedText type="small">This draft safety check is unvalidated and cannot establish safety. The device stores its safety setting without encryption or an app lock; someone with device access may see it. The app cannot verify another person's screening or consent.</ThemedText>
          <ThemedText type="small">Earlier versions may have stored safety results on this device; existing data is not deleted by this update.</ThemedText>
        </Card>
      )}
      {activity.type === 'assessment' && <AssessmentPlayer assessment={activity} />}
      {activity.type === 'lesson' && <LessonPlayer lesson={activity} />}
      {activity.type === 'exercise' && <ExercisePlayer exercise={activity} />}
      {activity.type === 'conversation' && <ConversationPlayer conversation={activity} />}
      {activity.type === 'journal' && <JournalPlayer journal={activity} />}
      {activity.type === 'ritual' && <RitualPlayer ritual={activity} />}
      <Button label="Safety & Support" variant="secondary" onPress={() => router.replace('/safety')} />
      <Button label="Close" variant="secondary" onPress={() => router.canGoBack() ? router.back() : router.replace('/safety')} />
    </Screen>
  );
}

function Unavailable({ message }: { message: string }) {
  return <Screen><ThemedText>{message}</ThemedText><Button label="Safety & Support" onPress={() => router.replace('/safety')} /></Screen>;
}
