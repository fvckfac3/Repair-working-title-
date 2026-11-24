import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { secondsUntil } from './player-logic';

/** Local countdown based on elapsed time, not the number of interval callbacks. */
export function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) return;
    const update = () => {
      const remaining = secondsUntil(deadline, Date.now());
      setLeft(remaining);
      if (remaining === 0) setDeadline(null);
    };
    update();
    const interval = setInterval(update, 250);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') update();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [deadline]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const label = deadline !== null ? 'Pause timer' : left === seconds ? 'Start timer' : left === 0 ? 'Restart timer' : 'Resume timer';
  return (
    <View style={styles.wrap}>
      <ThemedText type="title" accessibilityRole="timer" accessibilityLabel={`${mm} minutes ${ss} seconds remaining`}>
        {mm}:{ss}
      </ThemedText>
      <Button label={label} variant="secondary" onPress={() => {
        if (deadline !== null) {
          setLeft(secondsUntil(deadline, Date.now()));
          setDeadline(null);
        } else {
          const remaining = left === 0 ? seconds : left;
          setLeft(remaining);
          setDeadline(Date.now() + remaining * 1000);
        }
      }} />
      <ThemedText type="small" themeColor="textSecondary">No alert is sent. The timer resets when you leave this screen.</ThemedText>
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { alignItems: 'center', gap: 8 } });
