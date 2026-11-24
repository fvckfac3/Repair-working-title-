import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { resources, safetyScreen } from '@/content';
import { useStore } from '@/state/store';

export default function SafetyScreen() {
  const { state, dispatch, storageStatus, retryStorage, deleteLocalSnapshot, clearDeletionResult, deleting, deletionResult } = useStore();
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const open = (url: string) => {
    setLinkError(false);
    void Linking.openURL(url).catch(() => setLinkError(true));
  };
  const deleteData = async () => {
    try {
      await deleteLocalSnapshot();
      setConfirmDelete(false);
    } catch {
      // The shared store retains the failure message even if this screen unmounts.
    }
  };

  return (
    <Screen>
      <Card tone="safety">
        <ThemedText type="smallBold">Use this app only when it feels safe to do so</ThemedText>
        <ThemedText type="small">
          This build stores information on this device using unencrypted storage, without an app lock or separate partner accounts. Someone with access to this device may see it. It does not send your answers to a partner.
        </ThemedText>
        <ThemedText type="small">Earlier versions may have stored safety results on this device. This update does not automatically delete existing data.</ThemedText>
        <ThemedText type="small">
          The app cannot verify another person's screening or consent. Consent must be freely given and can be withdrawn. A check cannot establish that a relationship or activity is safe.
        </ThemedText>
      </Card>

      {!__DEV__ ? (
        <Card>
          <ThemedText type="smallBold">Activities are not available in this release</ThemedText>
          <ThemedText type="small">The safety check and relationship content are drafts awaiting clinical review. This release does not automatically delete existing device data. Help is available below without a check.</ThemedText>
        </Card>
      ) : !state.hydrated ? (
        <Card>
          <ThemedText type="smallBold">{storageStatus === 'read-error' ? 'Saved data could not be read' : 'Reading saved data'}</ThemedText>
          <ThemedText type="small">Activities will remain unavailable until the data can be read. Support is available below.</ThemedText>
          {storageStatus === 'read-error' && <Button label="Retry reading data" disabled={deleting} onPress={retryStorage} />}
        </Card>
      ) : (
        <Card>
          <ThemedText type="smallBold">Development preview only</ThemedText>
          <ThemedText type="small">The safety check is unvalidated and all relationship content is awaiting clinical review. A negative result does not mean it is safe to participate.</ThemedText>
          <Button label={state.safetyScreenDone ? 'Retake the safety check' : 'Start the safety check'} disabled={deleting} onPress={() => router.push(`/activity/${safetyScreen.id}`)} />
          {state.safetyScreenDone && !state.safetyMode && <Button label="Continue to preview" variant="secondary" disabled={deleting} onPress={() => router.replace('/')} />}
        </Card>
      )}

      {state.safetyMode && (
        <Card tone="safety">
          <ThemedText type="smallBold">You deserve to feel safe</ThemedText>
          <ThemedText type="small">Relationship activities are paused in this preview. If you fear or are controlled by a partner, an individual domestic-violence advocate can help you consider options. You do not need to use the app to seek help.</ThemedText>
        </Card>
      )}

      <Section title="Delete local app data">
        <Card>
          <ThemedText type="small">You can delete this app's saved snapshot even if its data cannot be read. This includes journal entries, check-ins, results, progress, and settings, including safety mode.</ThemedText>
          <ThemedText type="small">Deletion is not secure erasure. Device or browser traces, backups, and copies outside the app may remain or be restored.</ThemedText>
          {storageStatus === 'read-error' && <ThemedText type="small">Saved data could not be read. It will not be replaced unless you confirm deletion. You can also retry reading it.</ThemedText>}
          {storageStatus === 'read-error' && <Button label="Retry reading saved data" variant="secondary" disabled={deleting} onPress={retryStorage} />}
          {storageStatus === 'write-error' && <ThemedText type="small">Some changes could not be saved; previous data may still be in storage. You can retry saving or delete the snapshot.</ThemedText>}
          {storageStatus === 'write-error' && <Button label="Retry saving changes" variant="secondary" disabled={deleting} onPress={retryStorage} />}
          {deleting ? (
            <ThemedText type="small" accessibilityRole="alert" accessibilityLiveRegion="polite">Deletion is in progress. Keep the app open until a result appears.</ThemedText>
          ) : confirmDelete ? (
            <>
              <ThemedText type="smallBold" accessibilityRole="alert">Delete the saved snapshot from this device?</ThemedText>
              <ThemedText type="small">This removes the app's current local snapshot if storage succeeds and resets the safety check and safety mode. Backups and device or browser traces may remain.</ThemedText>
              <Button label="Confirm delete local snapshot" variant="safety" onPress={() => { void deleteData(); }} />
              <Button label="Cancel deletion" variant="secondary" onPress={() => { setConfirmDelete(false); clearDeletionResult(); }} />
            </>
          ) : (
            <Button label="Review deletion of local data" variant="secondary" onPress={() => { clearDeletionResult(); setConfirmDelete(true); }} />
          )}
          {deletionResult === 'error' && !deleting && <ThemedText type="small" accessibilityRole="alert" accessibilityLiveRegion="polite">Deletion could not be confirmed. The snapshot may still be on this device. You can try again.</ThemedText>}
          {deletionResult === 'success' && !deleting && <ThemedText type="small" accessibilityRole="alert" accessibilityLiveRegion="polite">The local app snapshot was removed from app storage. Backups, device or browser traces, and other copies may remain.</ThemedText>}
        </Card>
      </Section>

      {linkError && <ThemedText>Could not open that link. You can use the number or address shown with another device or app if it is safe to do so.</ThemedText>}
      <Section title="Get help now">
        {[...resources('crisis'), ...resources('safety')].map((r) => (
          <Card key={r.id}>
            <ThemedText type="smallBold">{r.name}{r.region ? ` · ${r.region}` : ''}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{r.description}</ThemedText>
            {r.phone && <Button label={`Call ${r.phone}`} onPress={() => open(`tel:${r.phone}`)} />}
            {r.text && <ThemedText type="small">Text: {r.text}</ThemedText>}
            {r.url && <><ThemedText type="small">{r.url}</ThemedText><Button label="Website" variant="secondary" onPress={() => open(r.url!)} /></>}
          </Card>
        ))}
      </Section>
      <Section title="Professional support">
        <ThemedText type="small">If you fear a partner, consider individual support from a domestic-violence advocate rather than assuming joint counseling is safe.</ThemedText>
        {resources('therapy').map((r) => (
          <Card key={r.id}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small">{r.description}</ThemedText>
            {r.url && <><ThemedText type="small">{r.url}</ThemedText><Button label="Website" variant="secondary" onPress={() => open(r.url!)} /></>}
          </Card>
        ))}
      </Section>
      <Section title="Open another website">
        <ThemedText type="small">Opening a website does not close this app, erase history or hide activity on a shared device.</ThemedText>
        <Button label="Open weather website" variant="secondary" onPress={() => open('https://weather.com')} />
      </Section>
      {__DEV__ && state.hydrated && state.safetyMode && (
        <Section title="Safety mode">
          {!confirmRestore ? <Button label="Review paused activities setting" variant="secondary" disabled={deleting} onPress={() => setConfirmRestore(true)} /> : (
            <Card>
              <ThemedText type="small">Restoring the preview makes relationship activities available again. It does not establish that they are safe. You can leave them paused and still access support.</ThemedText>
              <Button label="Restore preview activities" disabled={deleting} onPress={() => { dispatch({ type: 'setSafetyMode', on: false }); setConfirmRestore(false); }} />
              <Button label="Keep activities paused" variant="secondary" onPress={() => setConfirmRestore(false)} />
            </Card>
          )}
        </Section>
      )}
    </Screen>
  );
}
