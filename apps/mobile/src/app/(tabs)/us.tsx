import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Card, Screen, Section } from '@/components/ui';
import { getActivity, weeklyConversationId } from '@/content';
import { useStore } from '@/state/store';

/** Exercises whose saved answers act as shared agreements on this tab. */
const AGREEMENTS = ['cts-ex-time-out-agreement', 'cts-ex-parking-lot'];

export default function UsScreen() {
  const { state } = useStore();
  const daily = state.checkins.filter((c) => c.kind === 'daily').slice(0, 7);
  const avg = (key: string) => {
    const vals = daily.map((c) => c.answers[key]).filter((v): v is number => typeof v === 'number');
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length + 1).toFixed(1) : '–';
  };

  return (
    <Screen padTop>
      <ThemedText type="title">Us</ThemedText>

      <Card>
        <ThemedText type="smallBold">Link with your partner</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Partner linking arrives with account sync. Until then, everything you do stays on this
          device. You can use Repair on your own, and when you link, you choose what to share.
        </ThemedText>
      </Card>

      <Section title="Last 7 check-ins">
        <Card>
          <ThemedText type="small">Average mood: {avg('mood')} / 5</ThemedText>
          <ThemedText type="small">Average connection: {avg('connection')} / 5</ThemedText>
        </Card>
      </Section>

      <Section title="Our agreements">
        {AGREEMENTS.map((id) => {
          const activity = getActivity(id);
          const saved = state.progress[id];
          if (!activity || activity.type !== 'exercise') return null;
          return (
            <Card key={id} onPress={() => router.push(`/activity/${id}`)}>
              <ThemedText type="smallBold">{activity.title}</ThemedText>
              {saved?.status === 'completed' ? (
                activity.steps
                  .filter((s) => saved.data[s.id] !== undefined && s.kind !== 'instruction')
                  .map((s) => (
                    <ThemedText key={s.id} type="small" themeColor="textSecondary">
                      {formatAnswer(saved.data[s.id])}
                    </ThemedText>
                  ))
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Not created yet. Tap to start.
                </ThemedText>
              )}
            </Card>
          );
        })}
      </Section>

      {!state.safetyMode && (
        <Section title="Weekly">
          <Card onPress={() => router.push(`/activity/${weeklyConversationId}`)}>
            <ThemedText type="smallBold">State of Us</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Appreciations, one concern each, and a plan for the week.
            </ThemedText>
          </Card>
        </Section>
      )}
    </Screen>
  );
}

function formatAnswer(v: unknown): string {
  if (Array.isArray(v)) return v.join(' · ');
  return String(v);
}
