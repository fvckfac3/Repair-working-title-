import type { Journal } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, Option } from '@/components/ui';
import { newId, useStore } from '@/state/store';

export function JournalPlayer({ journal }: { journal: Journal }) {
  const { dispatch } = useStore();
  const [prompt, setPrompt] = useState(journal.prompts[0]!);
  const [text, setText] = useState('');

  return (
    <View style={styles.gap}>
      <ThemedText type="title">{journal.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{journal.intro}</ThemedText>
      <View style={styles.options}>
        {journal.prompts.map((p) => (
          <Option key={p} label={p} selected={p === prompt} onPress={() => setPrompt(p)} />
        ))}
      </View>
      <Input multiline value={text} onChangeText={setText} placeholder="Write freely. This is private." />
      <Button
        label="Save privately"
        disabled={!text.trim()}
        onPress={() => {
          dispatch({
            type: 'addJournal',
            entry: { id: newId(), activityId: journal.id, prompt, text: text.trim(), createdAt: new Date().toISOString(), visibility: 'private' },
          });
          dispatch({ type: 'saveProgress', activityId: journal.id, data: {}, completed: true });
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ gap: { gap: 16 }, options: { gap: 8 } });
