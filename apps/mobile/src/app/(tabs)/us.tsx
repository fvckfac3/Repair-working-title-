import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { getActivity, getModule, weeklyConversationId } from '@/content';
import { useStore } from '@/state/store';

/** Exercises whose saved answers are shown on this device. */
const AGREEMENTS = ['cts-ex-time-out-agreement', 'cts-ex-parking-lot'];

export default function UsScreen() {
  const { state } = useStore();
  const daily = state.checkins.filter((c) => c.kind === 'daily').slice(0, 7);
  const avg = (key: string) => {
    const vals = daily.map((c) => c.answers[key]).filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4,
    );
    return vals.length ? `${(vals.reduce((a, b) => a + b, 0) / vals.length + 1).toFixed(1)} / 5` : 'Not recorded';
  };

  return (
    <Screen padTop>
      <ThemedText type="title">Us</ThemedText>
      <Card>
        <ThemedText type="smallBold">Your activity on this device</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          This prototype saves check-ins and notes unencrypted on this device without an app lock.
          Someone with access to the device may see them. Accounts, partner syncing, and sharing are not implemented.
        </ThemedText>
      </Card>

      <Section title="Last 7 daily check-ins">
        <Card>
          {daily.length ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Based on {daily.length} {daily.length === 1 ? 'check-in' : 'check-ins'}; scores range from 1 to 5.
              </ThemedText>
              <ThemedText type="small">Average mood: {avg('mood')}</ThemedText>
              <ThemedText type="small">Average connection: {avg('connection')}</ThemedText>
            </>
          ) : (
            <>
              <ThemedText type="smallBold">No daily check-ins yet</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Complete a check-in on Today to see a summary here.</ThemedText>
              <Button label="Go to Today" variant="secondary" onPress={() => router.push('/')} />
            </>
          )}
        </Card>
      </Section>

      {state.safetyMode ? (
        <Section title="Support">
          <Card tone="safety">
            <ThemedText type="smallBold">Take things at your own pace</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Relationship activities are paused. You can explore support options whenever you need them.
            </ThemedText>
            <Button label="Find support" variant="secondary" onPress={() => router.push('/safety')} />
          </Card>
        </Section>
      ) : (
        <>
          <Section title="Saved activities">
            <ThemedText type="small" themeColor="textSecondary">These answers are saved locally, not shared.</ThemedText>
            {AGREEMENTS.map((id) => {
              const activity = getActivity(id);
              const saved = state.progress[id];
              if (!activity || activity.type !== 'exercise') return null;
              const mod = getModule(activity.module);
              const needsGate = mod && ((mod.gating.adultsOnly && !state.adultConfirmed)
                || (mod.gating.confirmations.length > 0 && !state.gatesAccepted[mod.slug]));
              const answers = activity.steps.filter((s) =>
                s.kind !== 'instruction' && saved?.data[s.id] !== undefined && formatAnswer(saved.data[s.id]).trim(),
              );
              return (
                <Card key={id} onPress={() => needsGate ? router.push(`/module/${activity.module}`) : router.push(`/activity/${id}`)}
                  accessibilityHint={needsGate ? 'Opens the module to review entry requirements' : 'Opens this activity'}>
                  <ThemedText type="smallBold">{activity.title}</ThemedText>
                  {saved?.status === 'completed' ? (
                    answers.length ? answers.map((s) => (
                      <ThemedText key={s.id} type="small" themeColor="textSecondary">
                        {s.prompt}: {formatAnswer(saved.data[s.id])}
                      </ThemedText>
                    )) : <ThemedText type="small" themeColor="textSecondary">Completed; no written answers saved.</ThemedText>
                  ) : (
                    <ThemedText type="small" themeColor="textSecondary">
                      {saved?.status === 'started' ? 'In progress. Open to continue.' : 'Not started. Open to begin.'}
                    </ThemedText>
                  )}
                </Card>
              );
            })}
          </Section>
          <Section title="Weekly">
            <Card onPress={() => router.push(`/activity/${weeklyConversationId}`)} accessibilityHint="Opens the weekly conversation">
              <ThemedText type="smallBold">State of Us</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Appreciations, one concern each, and a plan for the week.
              </ThemedText>
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

function formatAnswer(v: unknown): string {
  if (Array.isArray(v)) return v.join(' · ');
  return v == null ? '' : String(v);
}
