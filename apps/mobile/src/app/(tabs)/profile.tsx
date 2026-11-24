import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { onboardingAssessment } from '@/content';
import { useStore } from '@/state/store';

export default function ProfileScreen() {
  const { state, dispatch } = useStore();
  const [showAllJournal, setShowAllJournal] = useState(false);
  const assessmentCount = state.results[onboardingAssessment.id]?.length ?? 0;

  const deleteEntry = (id: string) => {
    const doDelete = () => dispatch({ type: 'deleteJournal', id });
    const message = 'Remove this journal entry when changes are saved? Backups and device or browser traces may remain.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(message)) doDelete();
      return;
    }
    Alert.alert('Delete this entry?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete entry', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <Screen padTop>
      <ThemedText type="title">Me</ThemedText>

      <Card tone="safety" onPress={() => router.push('/safety')}>
        <ThemedText type="smallBold" themeColor="safety">
          Safety & Support
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Crisis lines, finding a therapist, and your private safety check.
        </ThemedText>
      </Card>

      <Section title="My journal">
        {state.journal.length === 0 ? (
          <Card>
            <ThemedText type="small" themeColor="textSecondary">
              No entries yet. Find a journal prompt in the library when you're ready.
            </ThemedText>
            <Button label="Browse the library" variant="secondary" onPress={() => router.push('/library')} />
          </Card>
        ) : (
          <>
            {(showAllJournal ? state.journal : state.journal.slice(0, 20)).map((j) => (
              <Card key={j.id}>
                <ThemedText type="small" themeColor="textSecondary">
                  {new Date(j.createdAt).toLocaleDateString()} · {j.prompt}
                </ThemedText>
                <ThemedText type="small">{j.text}</ThemedText>
                <Button label={`Delete entry from ${new Date(j.createdAt).toLocaleDateString()}`}
                  variant="secondary" onPress={() => deleteEntry(j.id)} />
              </Card>
            ))}
            {state.journal.length > 20 && (
              <Button label={showAllJournal ? 'Show recent entries' : `Show all ${state.journal.length} entries`}
                variant="secondary" onPress={() => setShowAllJournal(!showAllJournal)} />
            )}
          </>
        )}
      </Section>

      <Section title="Assessments">
        <Card onPress={() => router.push(`/activity/${onboardingAssessment.id}`)}>
          <ThemedText type="smallBold">{assessmentCount ? 'Retake' : 'Take'} the {onboardingAssessment.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {assessmentCount ? `Saved results: ${assessmentCount}. Retaking may update your path.` : 'Not taken yet.'}
          </ThemedText>
        </Card>
      </Section>

      <Section title="Privacy">
        <ThemedText type="small" themeColor="textSecondary">
          This prototype stores what you enter unencrypted on this device, without an app lock.
          Someone with device access may be able to see it. Accounts, partner syncing, and sharing
          are not implemented. Repair is an educational tool, not therapy or a crisis service.
        </ThemedText>
        <Button label="Review deletion in Safety & Support" variant="secondary" onPress={() => router.push('/safety')} />
      </Section>
    </Screen>
  );
}
