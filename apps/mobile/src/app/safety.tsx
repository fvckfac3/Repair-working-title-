import { router } from 'expo-router';
import { Linking } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { resources, safetyScreen } from '@/content';
import { useStore } from '@/state/store';

/** A neutral page to jump to instantly if someone walks in. */
const QUICK_EXIT_URL = 'https://weather.com';

export default function SafetyScreen() {
  const { state, dispatch } = useStore();

  return (
    <Screen>
      <Button label="Quick exit" variant="safety" onPress={() => Linking.openURL(QUICK_EXIT_URL)} />

      <ThemedText themeColor="textSecondary">
        Only you can see this page. Nothing here is shared with your partner.
      </ThemedText>

      {state.safetyMode && (
        <Card tone="safety">
          <ThemedText type="smallBold">You deserve to feel safe</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Based on your private check, we've paused the activities you'd do together and the
            ones that can stir up conflict. If you're afraid of your partner, a trained advocate
            can help you think through options and make a safety plan, confidentially.
          </ThemedText>
        </Card>
      )}

      <Section title="Get help now">
        {[...resources('crisis'), ...resources('safety')].map((r) => (
          <Card key={r.id}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {r.description}
            </ThemedText>
            {r.phone && <Button label={`Call ${r.phone}`} onPress={() => Linking.openURL(`tel:${r.phone}`)} />}
            {r.text && (
              <ThemedText type="small" themeColor="textSecondary">
                Text: {r.text}
              </ThemedText>
            )}
            {r.url && <Button label="Website" variant="secondary" onPress={() => Linking.openURL(r.url!)} />}
          </Card>
        ))}
      </Section>

      <Section title="Professional support">
        {resources('therapy').map((r) => (
          <Card key={r.id} onPress={r.url ? () => Linking.openURL(r.url!) : undefined}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {r.description}
            </ThemedText>
          </Card>
        ))}
      </Section>

      <Section title="Private safety check">
        <Button label="Retake the private check" variant="secondary" onPress={() => router.push(`/activity/${safetyScreen.id}`)} />
        {state.safetyMode && (
          <Button
            label="I'm safe: restore all activities"
            variant="secondary"
            onPress={() => dispatch({ type: 'setSafetyMode', on: false })}
          />
        )}
      </Section>
    </Screen>
  );
}
