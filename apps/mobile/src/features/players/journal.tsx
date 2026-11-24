import type { Journal } from '@repair/content-schema';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Option } from '@/components/ui';
import { newId, useStore } from '@/state/store';

export function JournalPlayer({ journal }: { journal: Journal }) {
  const { state, dispatch } = useStore();
  const saved = state.progress[journal.id]?.data.journalDraft as { prompt?: unknown; text?: unknown } | null | undefined;
  const [prompt, setPrompt] = useState(typeof saved?.prompt === 'string' && journal.prompts.includes(saved.prompt) ? saved.prompt : journal.prompts[0]!);
  const [text, setText] = useState(typeof saved?.text === 'string' ? saved.text : '');
  const saveDraft = (nextPrompt: string, nextText: string) => dispatch({
    type: 'saveProgress', activityId: journal.id, data: { journalDraft: { prompt: nextPrompt, text: nextText } }, completed: false,
  });
  // These exact authored disclosures already cover storage and access. If the
  // wording changes, fall back to the complete notice rather than omitting it.
  const fullNotice = journal.intro.includes('Entries stay on this device. There is no app lock or encryption, so anyone with access to it may be able to read them. In-app sharing is not available.');
  const storageNotice = journal.intro.includes('Information is stored unencrypted on this device and may be visible to anyone with access.');
  const privacy = fullNotice
    ? 'Drafts save automatically and have the same storage and access limitations as entries. There are no separate partner accounts.'
    : storageNotice
      ? 'Drafts save automatically and have the same storage and access limitations as entries. There is no app lock or separate partner accounts; partner sharing is not available.'
      : 'Drafts save automatically. Drafts and entries are stored unencrypted on this device without an app lock; anyone with access may read them. There are no separate partner accounts or partner sharing.';
  return (
    <View style={styles.gap}>
      <ThemedText type="title">{journal.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{journal.intro}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {privacy}
      </ThemedText>
      <View style={styles.options}>
        {journal.prompts.map((p, i) => (
          <Option key={`${p}-${i}`} label={p} selected={p === prompt} onPress={() => { setPrompt(p); saveDraft(p, text); }} />
        ))}
      </View>
      <Input multiline accessibilityLabel="Journal entry" value={text} onChangeText={(value) => { setText(value); saveDraft(prompt, value); }} placeholder="Write here…" />
      <Button label="Save entry" disabled={!text.trim()} onPress={() => {
        dispatch({ type: 'addJournal', entry: { id: newId(), activityId: journal.id, prompt, text, createdAt: new Date().toISOString(), visibility: 'private' } });
        dispatch({ type: 'saveProgress', activityId: journal.id, data: { journalDraft: null }, completed: true });
        router.back();
      }} />
      <Button label="Discard draft" variant="secondary" onPress={() => {
        setText('');
        dispatch({ type: 'saveProgress', activityId: journal.id, data: { journalDraft: null }, completed: false });
      }} />
      <Button label="Stop and keep draft" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}
const styles = StyleSheet.create({ gap: { gap: 16 }, options: { gap: 8 } });
