import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, Ui } from '@/constants/theme';
import { usePeople } from '@/hooks/use-people';
import type { Person } from '@/lib/people';
import { leavePeople, loadDetails, type JoinDetails } from '@/lib/people-api';
import { EXAMPLE_ID, examplePerson } from '@/lib/people-example';
import { InTuneMoment } from './in-tune-moment';
import { InTuneRow } from './in-tune-row';
import { JoinFlow, YouForm } from './join-flow';
import { SongDeck } from './song-deck';

function EditPeople({ onClose, onChanged }: { onClose: () => void; onChanged: () => Promise<void> }) {
  const [details, setDetails] = useState<JoinDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => loadDetails()
    .then(setDetails)
    .catch(() => setDetails(null))
    .finally(() => setLoading(false)), []);
  useEffect(() => { void load(); }, [load]);

  async function changed() {
    await onChanged();
    onClose();
  }

  function confirmLeave() {
    Alert.alert(
      'Leave People?',
      'Your name, handle, hearts and swipes here are deleted from our server. Your Library stays on this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave People',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              if (await leavePeople()) await changed();
              else setNote("Couldn't leave just now. Try again.");
            } catch {
              setNote("Couldn't leave just now. Try again.");
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.edit} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={onClose}
          disabled={saving || leaving}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.icon}>
          <Ionicons name="chevron-back" size={26} color={Colors.text} />
        </Pressable>
        {loading ? <ActivityIndicator color={Colors.text} /> : details ? (
          <YouForm initial={details} onSaved={changed} buttonLabel="Save" disabled={leaving} onBusyChange={setSaving} />
        ) : (
          <View style={styles.message}>
            <ThemedText>People needs a connection.</ThemedText>
            <PressableScale onPress={() => { setLoading(true); void load(); }} style={styles.primary}>
              <ThemedText style={styles.primaryText}>Try again</ThemedText>
            </PressableScale>
          </View>
        )}
        {!!note && <ThemedText style={styles.dim}>{note}</ThemedText>}
        <Pressable onPress={confirmLeave} disabled={leaving || saving} accessibilityRole="button" style={styles.leave}>
          <ThemedText style={styles.leaveText}>Leave People</ThemedText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function PeopleScreen() {
  const router = useRouter();
  const p = usePeople();
  const load = p.load;
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [example, setExample] = useState<Person | null>(null);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {p.status === 'loading' ? (
        <View style={styles.center}><ActivityIndicator color={Colors.text} /></View>
      ) : p.status === 'offline' ? (
        <View style={styles.center}>
          <ThemedText>People needs a connection.</ThemedText>
          <PressableScale onPress={p.load} style={styles.primary}>
            <ThemedText style={styles.primaryText}>Try again</ThemedText>
          </PressableScale>
        </View>
      ) : p.status === 'locked' ? (
        <View style={styles.center}>
          <ThemedText type="title" style={styles.centerText}>People is for adults.</ThemedText>
          <ThemedText style={styles.dim}>Everything else in Blindspot is yours.</ThemedText>
        </View>
      ) : p.status === 'new' ? (
        <JoinFlow onJoined={p.load} onLocked={() => p.setStatus('locked')} />
      ) : editing ? (
        <EditPeople onClose={() => setEditing(false)} onChanged={p.load} />
      ) : (
        <>
          <View style={styles.header}>
            <ThemedText type="title">People</ThemedText>
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel="People settings"
              style={styles.icon}>
              <Ionicons name="settings-outline" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <InTuneRow people={p.people} progress={p.progress} onExample={() => setExample(examplePerson())} />
          <SongDeck deck={p.deck} deckLoading={p.deckLoading} verdict={p.verdict} next={p.next} />
          {p.moment && (
            <InTuneMoment
              person={p.moment}
              onClose={p.closeMoment}
              onWaved={() => { p.closeMoment(); void p.refreshPeople(); }}
            />
          )}
          {example && (
            <InTuneMoment
              person={example}
              example
              onClose={() => setExample(null)}
              onWaved={() => {
                setExample(null);
                router.push({ pathname: '/person', params: { id: EXAMPLE_ID } });
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  icon: { ...Ui.textButton, alignSelf: 'flex-start', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.lg },
  centerText: { textAlign: 'center' },
  dim: { color: Colors.textSecondary, textAlign: 'center' },
  primary: { ...Ui.outlineButton, backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryText: { ...Ui.label, color: Colors.accentText },
  edit: { padding: Spacing.xl, gap: Spacing.xl },
  message: { gap: Spacing.lg },
  leave: { ...Ui.textButton, alignItems: 'center' },
  leaveText: { color: Colors.destructive },
});
