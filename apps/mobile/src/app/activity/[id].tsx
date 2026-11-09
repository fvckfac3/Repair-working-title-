import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { getActivity, getModule, isHiddenForSafety } from '@/content';
import { AssessmentPlayer } from '@/features/players/assessment';
import { ConversationPlayer } from '@/features/players/conversation';
import { ExercisePlayer } from '@/features/players/exercise';
import { JournalPlayer } from '@/features/players/journal';
import { LessonPlayer } from '@/features/players/lesson';
import { RitualPlayer } from '@/features/players/ritual';
import { useStore } from '@/state/store';

export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useStore();
  const activity = getActivity(id);

  if (!activity) {
    return (
      <Screen>
        <ThemedText>Activity not found.</ThemedText>
        <Button label="Close" onPress={() => router.back()} />
      </Screen>
    );
  }

  const mod = getModule(activity.module);
  const blocked =
    (state.safetyMode && isHiddenForSafety(activity)) ||
    (mod?.gating.adultsOnly && !state.adultConfirmed) ||
    (mod && mod.gating.confirmations.length > 0 && !state.gatesAccepted[mod.slug]);

  if (blocked) {
    return (
      <Screen>
        <ThemedText type="subtitle">This activity is paused for now</ThemedText>
        <ThemedText themeColor="textSecondary">
          It isn't available right now. You can still use lessons and private reflection.
        </ThemedText>
        <Button label="Close" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {activity.type === 'assessment' && <AssessmentPlayer assessment={activity} />}
      {activity.type === 'lesson' && <LessonPlayer lesson={activity} />}
      {activity.type === 'exercise' && <ExercisePlayer exercise={activity} />}
      {activity.type === 'conversation' && <ConversationPlayer conversation={activity} />}
      {activity.type === 'journal' && <JournalPlayer journal={activity} />}
      {activity.type === 'ritual' && <RitualPlayer ritual={activity} />}
      <Button label="Close" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
