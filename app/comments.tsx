import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { cleanComment, cleanVibe, mergeVibes, timeAgo, type Comment, type Vibe } from '@/lib/comments';
import { loadDeviceId, loadSenderName } from '@/lib/discovery-storage';
import { fetchArtistTags } from '@/lib/pool';
import { addVibe, fetchComments, fetchVibes, postComment, reportComment } from '@/lib/supabase';

/** A song's comments, opened only after its reveal. Tags up top so it's never empty. */
export default function CommentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ trackId: string; title?: string; artist?: string }>();
  const trackId = Number(params.trackId);
  const artist = params.artist ?? '';

  const [tags, setTags] = useState<string[]>([]);
  const [votes, setVotes] = useState<Vibe[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [newVibe, setNewVibe] = useState('');
  const [name, setName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [reported, setReported] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadDeviceId().then(setDeviceId);
    loadSenderName().then((n) => setName(n || 'A listener'));
    if (artist) fetchArtistTags(artist).then(setTags);
    if (!Number.isFinite(trackId)) return;
    fetchVibes(trackId).then((v) => setVotes(v ?? []));
    fetchComments(trackId).then((c) => {
      setNow(Date.now());
      setComments(c ?? []);
    });
  }, [trackId, artist]);

  const vibes = useMemo(() => mergeVibes(tags, votes), [tags, votes]);

  async function vote(word: string) {
    const w = cleanVibe(word);
    if (!w || mine.has(w)) return;
    setMine(new Set(mine).add(w));
    setVotes((cur) => {
      const hit = cur.find((v) => v.word === w);
      return hit ? cur.map((v) => (v.word === w ? { ...v, count: v.count + 1 } : v)) : [...cur, { word: w, count: 1 }];
    });
    await addVibe(trackId, deviceId, w);
  }

  async function send() {
    const body = cleanComment(draft);
    if (!body || !deviceId) return;
    setDraft('');
    setFailed(false);
    const optimistic: Comment = { id: -Date.now(), name, body, created_at: new Date().toISOString() };
    setComments((cur) => [optimistic, ...(cur ?? [])]);
    if (await postComment(trackId, deviceId, name, body)) return;
    // Didn't go through: take it back off the list and give the text back.
    setComments((cur) => (cur ?? []).filter((c) => c.id !== optimistic.id));
    setDraft(body);
    setFailed(true);
  }

  const canSend = !!cleanComment(draft) && !!deviceId;

  async function report(c: Comment) {
    setReported(new Set(reported).add(c.id));
    if (c.id > 0) await reportComment(c.id, deviceId);
  }

  const visible = (comments ?? []).filter((c) => !reported.has(c.id));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.lg }]} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={26} color={Colors.textSecondary} />
        </TouchableOpacity>
        <ThemedText type="eyebrow">What people think</ThemedText>
        <ThemedText type="title" numberOfLines={2}>
          {params.title}
        </ThemedText>
        <ThemedText style={styles.dim}>{artist}</ThemedText>

        <ThemedText type="eyebrow" style={styles.section}>
          What people call it
        </ThemedText>
        <View style={styles.chips}>
          {vibes.map((v) => {
            const on = mine.has(v.word);
            return (
              <TouchableOpacity key={v.word} onPress={() => vote(v.word)} activeOpacity={0.7}>
                <View style={[styles.chip, on && styles.chipOn]}>
                  <ThemedText type="label" style={{ color: on ? Colors.accentText : Colors.text }}>
                    {v.word}
                  </ThemedText>
                  {v.count > 0 && <ThemedText style={[styles.chipCount, on && { color: Colors.accentText }]}>{v.count}</ThemedText>}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={[styles.chip, styles.chipInput]}>
            <TextInput
              value={newVibe}
              onChangeText={setNewVibe}
              onSubmitEditing={() => {
                vote(newVibe);
                setNewVibe('');
              }}
              placeholder="+ your word"
              placeholderTextColor={Colors.textTertiary}
              maxLength={24}
              style={styles.chipText}
              returnKeyType="done"
            />
          </View>
        </View>
        {tags.length > 0 && <ThemedText style={styles.credit}>Tags from Last.fm listeners</ThemedText>}

        <ThemedText type="eyebrow" style={styles.section}>
          Comments{visible.length > 0 ? ` · ${visible.length}` : ''}
        </ThemedText>
        {comments === null ? (
          <ThemedText style={styles.dim}>Loading…</ThemedText>
        ) : visible.length === 0 ? (
          <ThemedText style={styles.empty}>Nobody&apos;s said anything yet. You found it, so you get the first word.</ThemedText>
        ) : (
          visible.map((c) => (
            <View key={c.id} style={styles.comment}>
              <View style={styles.commentHead}>
                <ThemedText style={styles.commentName}>{c.name}</ThemedText>
                <ThemedText style={styles.commentTime}>{timeAgo(Date.parse(c.created_at), now)}</ThemedText>
                <TouchableOpacity onPress={() => report(c)} hitSlop={10} accessibilityLabel="Report comment" style={styles.flag}>
                  <Ionicons name="flag-outline" size={14} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <ThemedText>{c.body}</ThemedText>
            </View>
          ))
        )}
      </ScrollView>

      {failed && <ThemedText style={styles.failed}>That didn&apos;t send. Check your connection and try again.</ThemedText>}
      <View style={[styles.composer, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Say something about it…"
          placeholderTextColor={Colors.textTertiary}
          maxLength={280}
          multiline
          style={styles.input}
        />
        <TouchableOpacity onPress={send} disabled={!canSend} hitSlop={8}>
          <Ionicons name="arrow-up-circle" size={36} color={canSend ? Colors.signal : Colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.xs },
  close: { alignSelf: 'flex-start', marginBottom: Spacing.sm },
  dim: { color: Colors.textSecondary },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, borderRadius: Radius.pill, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  chipOn: { backgroundColor: Colors.accent },
  chipCount: { fontFamily: Fonts.monoMedium, fontSize: 12, color: Colors.signal },
  chipInput: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  chipText: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 14, minWidth: 90, padding: 0 },
  credit: { color: Colors.textTertiary, fontSize: 11, marginTop: Spacing.xs },
  empty: { fontFamily: Fonts.note, fontSize: 22, lineHeight: 26, color: Colors.textSecondary, transform: [{ rotate: '-1.5deg' }] },
  comment: { paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, gap: 4 },
  commentHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  commentName: { fontFamily: 'Figtree_700Bold', fontSize: 14 },
  commentTime: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textTertiary },
  flag: { marginLeft: 'auto' },
  failed: { fontSize: 13, color: Colors.text, backgroundColor: Colors.surfaceElevated, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, backgroundColor: Colors.surface },
  input: { flex: 1, color: Colors.text, fontFamily: Fonts.sans, fontSize: 16, maxHeight: 120, paddingVertical: Spacing.sm },
});
