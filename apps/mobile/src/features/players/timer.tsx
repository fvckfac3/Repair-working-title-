import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';

/** Countdown timer. Give it a `key` to reset it when `seconds` changes. */
export function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Stop once we reach zero (derived, so no extra effect is needed).
  const isRunning = running && left > 0;
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const label = isRunning ? 'Pause timer' : left === seconds ? 'Start timer' : left === 0 ? 'Restart' : 'Resume';
  return (
    <View style={styles.wrap}>
      <ThemedText type="title" accessibilityRole="timer">
        {mm}:{ss}
      </ThemedText>
      <Button
        label={label}
        variant="secondary"
        onPress={() => {
          if (left === 0) setLeft(seconds);
          setRunning(left === 0 ? true : !isRunning);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 8 } });
