import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { cleanHandle, nameLooksLikeContact, type Platform, type Twin } from '@/lib/twins';
import { fetchTwins, leaveTwins, myProfile, saveProfile, syncLikesNow, type MyProfile } from '@/lib/twins-api';

const PLATFORMS: { key: Platform | null; label: string }[] = [
  { key: null, label: 'None' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'snapchat', label: 'Snapchat' },
  { key: 'tiktok', label: 'TikTok' },
];

type State = { kind: 'loading' } | { kind: 'offline' } | { kind: 'form'; profile: MyProfile | null } | { kind: 'list'; twins: Twin[] | null };

/** Taste Twins: join (name, 18+, optional handle), then the people who share your ears. */
export default function TwinsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    const profile = await myProfile();
    if (profile === 'error') return setState({ kind: 'offline' });
    if (!profile) return setState({ kind: 'form', profile: null });
    setState({ kind: 'list', twins: null });
    await syncLikesNow(); // your saves on the server match your Liked list before matching
    const twins = await fetchTwins();
    setState(twins ? { kind: 'list', twins } : { kind: 'offline' });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function editProfile() {
    const profile = await myProfile();
    setState(profile === 'error' ? { kind: 'offline' } : { kind: 'form', profile });
  }

  function leave() {
    Alert.alert('Leave Taste Twins?', 'Your name, handle and saved songs are deleted from the server.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (await leaveTwins()) setState({ kind: 'form', profile: null });
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl }]}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      <ThemedText type="eyebrow">Taste Twins</ThemedText>
      <ThemedText type="title">People with your ears</ThemedText>

      {state.kind === 'loading' && <ActivityIndicator color={Colors.text} style={styles.spinner} />}
      {state.kind === 'offline' && <ThemedText style={styles.dim}>Taste Twins needs a connection. Try again in a minute.</ThemedText>}
      {state.kind === 'form' && <JoinForm initial={state.profile} onSaved={load} />}
      {state.kind === 'list' &&
        (state.twins === null ? (
          <ActivityIndicator color={Colors.text} style={styles.spinner} />
        ) : (
          <>
            {state.twins.length === 0 ? (
              <ThemedText style={styles.empty}>
                No twins yet. They show up once someone overlaps with you — the Daily Drop gets you there fastest.
              </ThemedText>
            ) : (
              state.twins.map((t) => (
                <PressableScale
                  key={t.id}
                  style={styles.twin}
                  onPress={() =>
                    router.push({
                      pathname: '/twin',
                      params: {
                        id: t.id,
                        name: t.name,
                        percent: String(t.percent),
                        summary: t.summary,
                        iWaved: String(t.iWaved),
                        theyWaved: String(t.theyWaved),
                        canWave: String(t.canWave),
                      },
                    })
                  }>
                  <View style={styles.twinText}>
                    <ThemedText style={styles.twinName} numberOfLines={1}>
                      {t.name}
                    </ThemedText>
                    <ThemedText style={styles.dim}>{t.summary}</ThemedText>
                    {t.theyWaved && !t.iWaved && <ThemedText style={styles.waved}>waved at you</ThemedText>}
                  </View>
                  <ThemedText style={styles.percent}>{t.percent}%</ThemedText>
                </PressableScale>
              ))
            )}
            <View style={styles.footer}>
              <Pressable onPress={editProfile} hitSlop={8}>
                <ThemedText style={styles.link}>Edit what I share</ThemedText>
              </Pressable>
              <Pressable onPress={leave} hitSlop={8}>
                <ThemedText style={styles.link}>Leave Taste Twins</ThemedText>
              </Pressable>
            </View>
          </>
        ))}
    </ScrollView>
  );
}

function JoinForm({ initial, onSaved }: { initial: MyProfile | null; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [adult, setAdult] = useState(initial?.adult ?? false);
  const [platform, setPlatform] = useState<Platform | null>(initial?.platform ?? null);
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cleaned = platform && handle.trim() ? cleanHandle(handle, platform) : null;
  const handleBad = !!platform && !!handle.trim() && !cleaned;
  const nameBad = nameLooksLikeContact(name);
  const canSave = name.trim().length > 0 && !nameBad && !handleBad && !saving;

  async function save() {
    setSaving(true);
    setError('');
    const ok = await saveProfile({ name: name.trim().slice(0, 30), adult, platform: adult ? platform : null, handle: adult ? cleaned : null });
    setSaving(false);
    if (ok) onSaved();
    else setError('Couldn’t save just now. Check your connection.');
  }

  return (
    <View style={styles.form}>
      <ThemedText style={styles.dim}>Your name and the songs you saved or voted on in the Daily Drop are used to find people with your taste.</ThemedText>
      <ThemedText style={styles.dim}>Your handle stays hidden until you both wave.</ThemedText>
      <ThemedText style={styles.dim}>Leave any time and it’s all deleted.</ThemedText>

      <ThemedText type="label" style={styles.label}>
        Name
      </ThemedText>
      <TextInput value={name} onChangeText={setName} maxLength={30} placeholder="A nickname" placeholderTextColor={Colors.textTertiary} style={styles.input} />
      <ThemedText type="caption" style={nameBad ? styles.error : styles.dim}>
        {nameBad ? 'Keep handles, links and numbers out of your name. That’s what waving is for.' : 'Every twin sees this, so a nickname is best.'}
      </ThemedText>

      <Pressable style={styles.check} onPress={() => setAdult(!adult)} hitSlop={6}>
        <Ionicons name={adult ? 'checkbox' : 'square-outline'} size={22} color={adult ? Colors.accent : Colors.textSecondary} />
        <ThemedText>I’m 18 or older</ThemedText>
      </Pressable>
      <ThemedText type="caption" style={styles.dim}>
        {adult ? 'You can wave at twins and share a handle.' : 'Under 18 you can see your twins and their songs, but not wave or share a handle.'}
      </ThemedText>

      {adult && (
        <>
          <ThemedText type="label" style={styles.label}>
            A handle to share (optional)
          </ThemedText>
          <View style={styles.segment}>
            {PLATFORMS.map((p) => {
              const on = platform === p.key;
              return (
                <Pressable key={p.label} style={[styles.segmentItem, on && styles.segmentOn]} onPress={() => setPlatform(p.key)}>
                  <ThemedText type="label" style={{ color: on ? Colors.accentText : Colors.textSecondary }}>
                    {p.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {platform && (
            <>
              <TextInput
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={80}
                placeholder="@username"
                placeholderTextColor={Colors.textTertiary}
                style={styles.input}
              />
              {handleBad && <ThemedText style={styles.error}>That doesn’t look like a username.</ThemedText>}
            </>
          )}
        </>
      )}

      <PressableScale onPress={save} style={[styles.primary, !canSave && styles.disabled]} disabled={!canSave}>
        <ThemedText style={styles.primaryText}>{saving ? 'Saving…' : initial ? 'Save' : 'Find my twins'}</ThemedText>
      </PressableScale>
      {!!error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  back: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  spinner: { marginTop: Spacing.xl },
  dim: { color: Colors.textSecondary },
  empty: { fontFamily: Fonts.note, fontSize: 20, lineHeight: 24, color: Colors.textSecondary, marginTop: Spacing.lg },
  twin: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.sm },
  twinText: { flex: 1, gap: 2 },
  twinName: { fontFamily: 'Figtree_700Bold', fontSize: 17, lineHeight: 22 },
  waved: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.highlight, marginTop: 2 },
  percent: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32, color: Colors.signal },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl },
  link: { color: Colors.textSecondary, textDecorationLine: 'underline' },
  form: { gap: Spacing.sm, marginTop: Spacing.md },
  label: { marginTop: Spacing.md },
  input: { backgroundColor: Colors.surface, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  segment: { flexDirection: 'row', backgroundColor: Colors.surfaceElevated, borderRadius: Radius.pill, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.pill - 2 },
  segmentOn: { backgroundColor: Colors.accent },
  error: { color: Colors.text, fontSize: 13 },
  primary: { backgroundColor: Colors.accent, borderRadius: Radius.lg, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.lg },
  primaryText: { fontFamily: 'Figtree_700Bold', color: Colors.accentText },
  disabled: { opacity: 0.5 },
});
