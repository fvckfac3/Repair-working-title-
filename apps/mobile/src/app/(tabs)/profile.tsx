import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { onboardingAssessment } from '@/content';
import { useStore } from '@/state/store';

export default function ProfileScreen() {
  const { state, dispatch } = useStore();

  const reset = () => {
    const doReset = () => dispatch({ type: 'reset' });
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.('Delete all Repair data on this device?')) doReset();
      return;
    }
    Alert.alert('Delete all data?', 'This permanently removes everything stored on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doReset },
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
          <ThemedText type="small" themeColor="textSecondary">
            No entries yet. Journal prompts appear inside each module.
          </ThemedText>
        ) : (
          state.journal.slice(0, 20).map((j) => (
            <Card key={j.id}>
              <ThemedText type="small" themeColor="textSecondary">
                {new Date(j.createdAt).toLocaleDateString()} · {j.prompt}
              </ThemedText>
              <ThemedText type="small">{j.text}</ThemedText>
            </Card>
          ))
        )}
      </Section>

      <Section title="Assessments">
        <Card onPress={() => router.push(`/activity/${onboardingAssessment.id}`)}>
          <ThemedText type="smallBold">Retake the {onboardingAssessment.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Taken {state.results[onboardingAssessment.id]?.length ?? 0} time(s). Retaking updates your path.
          </ThemedText>
        </Card>
      </Section>

      <Section title="Privacy">
        <ThemedText type="small" themeColor="textSecondary">
          Everything you enter is private by default and stored only on this device. Repair is
          an educational tool, not therapy or a crisis service.
        </ThemedText>
        <Button label="Delete all my data" variant="secondary" onPress={reset} />
      </Section>
    </Screen>
  );
}
