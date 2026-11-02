import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleMusicLink, CreditLine } from '@/components/credits';
import { LikeButton } from '@/components/like-button';
import { PersonPrint } from '@/components/people/person-print';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { BottomSheet, SheetHeader } from '@/components/ui/sheet';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { usePlayback } from '@/hooks/use-playback';
import { artworkUrl, type DiscoveryTrack } from '@/lib/discovery';
import { chanceSentence, modeLabel, type Person } from '@/lib/people';
import { cachedPerson, fetchPeople, fetchPersonSongs } from '@/lib/people-api';
import { handleUrl, type Platform } from '@/lib/twins';
import { block, fetchHandle, report, wave } from '@/lib/twins-api';

const PLATFORM_NAME: Record<Platform, string> = {
  instagram: 'Instagram', snapchat: 'Snapchat', tiktok: 'TikTok', discord: 'Discord',
};
const REPORTS = [
  { label: 'Might be under 18', reason: 'under 18' },
  { label: 'Fake or spam', reason: 'fake or spam' },
  { label: 'Offensive name', reason: 'offensive name' },
  { label: 'Something else', reason: 'other' },
];

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PersonDetails key={id} id={id} />;
}

function PersonDetails({ id }: { id: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { player, status } = usePlayback();
  const [person, setPerson] = useState<Person | null>(() => cachedPerson(id));
  const [loading, setLoading] = useState(!person);
  const [songs, setSongs] = useState<{ shared: DiscoveryTrack[]; theirs: DiscoveryTrack[] } | null>(null);
  const [contact, setContact] = useState<{ handle: string; platform: Platform } | null | undefined>(undefined);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const mutual = !!person?.row.i_waved && !!person?.row.they_waved;
  const personId = person?.row.person;

  useEffect(() => {
    if (cachedPerson(id)) return;
    let cancelled = false;
    void (async () => {
      try {
        await fetchPeople();
        if (!cancelled) setPerson(cachedPerson(id));
      } catch {
        if (!cancelled) setPerson(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    fetchPersonSongs(personId)
      .then((result) => { if (!cancelled) setSongs(result); })
      .catch(() => { if (!cancelled) setSongs({ shared: [], theirs: [] }); });
    return () => { cancelled = true; };
  }, [personId, mutual]);

  useEffect(() => {
    if (!mutual || !personId) return;
    let cancelled = false;
    fetchHandle(personId)
      .then((result) => { if (!cancelled) setContact(result); })
      .catch(() => { if (!cancelled) setContact(null); });
    return () => { cancelled = true; };
  }, [mutual, personId]);

  useFocusEffect(useCallback(() => () => player.pause(), [player]));

  function toggle(track: DiscoveryTrack) {
    if (playingId === track.id && status.playing) {
      player.pause();
      return;
    }
    player.replace(track.previewUrl);
    player.play();
    setPlayingId(track.id);
  }

  async function sayHi() {
    if (!person || busy) return;
    setBusy(true);
    if (await wave(id)) setPerson({ ...person, row: { ...person.row, i_waved: true } });
    else setNote('Couldn’t wave just now. Try again.');
    setBusy(false);
  }

  function confirmBlock() {
    if (!person) return;
    Alert.alert(`Block ${person.row.name}?`, 'They won’t see you and you won’t see them.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          if (await block(id)) router.back();
          else setNote('Couldn’t block just now. Try again.');
        },
      },
    ]);
  }

  async function sendReport(reason: string) {
    if (busy) return;
    setBusy(true);
    setNote((await report(id, reason)) ? 'Reported. Thanks for telling us.' : 'Couldn’t report just now. Try again.');
    setBusy(false);
    setReporting(false);
  }

  const songRow = (track: DiscoveryTrack) => (
    <View key={track.id} style={styles.row}>
      <Pressable
        onPress={() => toggle(track)}
        accessibilityRole="button"
        accessibilityLabel={`${playingId === track.id && status.playing ? 'Pause' : 'Play'} ${track.trackName}`}
        style={styles.artWrap}>
        <Image source={{ uri: artworkUrl(track.artworkUrl100, 200) }} style={styles.art} />
        <View style={styles.playBadge}>
          <Ionicons name={playingId === track.id && status.playing ? 'pause' : 'play'} size={14} color={Colors.accentText} />
        </View>
      </Pressable>
      <View style={styles.rowText}>
        <ThemedText style={styles.rowTitle} numberOfLines={1}>{track.trackName}</ThemedText>
        <ThemedText style={styles.dim} numberOfLines={1}>{track.artistName}</ThemedText>
        <View style={styles.links}>
          <LikeButton track={track} size={18} />
          <AppleMusicLink trackId={track.id} url={track.trackViewUrl} height={24} />
        </View>
      </View>
    </View>
  );
  const contactUrl = contact ? handleUrl(contact.platform, contact.handle) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scroll, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
      ]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}>
        <Ionicons name="chevron-back" size={26} color={Colors.text} />
      </Pressable>
      {loading ? <ActivityIndicator color={Colors.text} /> : !person ? (
        <ThemedText>This person isn&apos;t here anymore.</ThemedText>
      ) : (
        <>
          <View style={styles.print}>
            <PersonPrint trackId={person.row.shared_tracks[0] ?? 0} rings={person.row.print} size={180} />
          </View>
          <ThemedText type="title" numberOfLines={2}>{person.row.name}</ThemedText>
          <View style={styles.mode}><ThemedText style={styles.modeText}>{modeLabel(person.row.mode)}</ThemedText></View>
          <ThemedText style={styles.dim}>{chanceSentence(person.score.shared, person.score.expected)}</ThemedText>
          <View style={styles.waveBox}>
            {mutual ? (
              contact === undefined ? <ActivityIndicator color={Colors.text} /> : contact ? (
                <View style={styles.contact}>
                  <ThemedText selectable style={styles.contactText}>
                    {contactUrl ? `@${contact.handle} on ${PLATFORM_NAME[contact.platform]}` : contact.handle}
                  </ThemedText>
                  {contactUrl ? (
                    <PressableScale style={styles.primary} onPress={() => { void Linking.openURL(contactUrl); }}>
                      <ThemedText style={styles.primaryText}>Open</ThemedText>
                    </PressableScale>
                  ) : (
                    <ThemedText style={styles.dim}>Search for this username on Discord.</ThemedText>
                  )}
                </View>
              ) : (
                <ThemedText style={styles.dim}>You both waved. They didn’t share a handle.</ThemedText>
              )
            ) : person.row.i_waved ? (
              <ThemedText style={styles.dim}>Waved. If they wave back, you’ll see each other’s handle.</ThemedText>
            ) : (
              <>
                {person.row.they_waved && (
                  <ThemedText style={styles.wavedAtYou}>{person.row.name} waved at you.</ThemedText>
                )}
                <PressableScale style={styles.primary} onPress={sayHi} disabled={busy}>
                  <Ionicons name="hand-right-outline" size={18} color={Colors.accentText} />
                  <ThemedText style={styles.primaryText}>{person.row.they_waved ? 'Wave back' : 'Wave'}</ThemedText>
                </PressableScale>
              </>
            )}
          </View>
          {!!note && <ThemedText style={styles.dim}>{note}</ThemedText>}
          <ThemedText type="eyebrow" style={styles.section}>Songs you share</ThemedText>
          {songs === null ? <ActivityIndicator color={Colors.text} /> : (
            <>
              {songs.shared.map(songRow)}
              {songs.shared.length === 0 && (
                <ThemedText style={styles.dim}>Their songs didn’t load. Try again in a minute.</ThemedText>
              )}
              {mutual && songs.theirs.length > 0 && (
                <>
                  <ThemedText type="eyebrow" style={styles.section}>What else they hearted</ThemedText>
                  {songs.theirs.map(songRow)}
                </>
              )}
            </>
          )}
          <View style={styles.footer}>
            <Pressable onPress={confirmBlock} accessibilityRole="button" style={Ui.textButton}>
              <ThemedText style={styles.link}>Block</ThemedText>
            </Pressable>
            <Pressable onPress={() => setReporting(true)} accessibilityRole="button" style={Ui.textButton}>
              <ThemedText style={styles.link}>Report</ThemedText>
            </Pressable>
          </View>
          <BottomSheet visible={reporting} onClose={() => setReporting(false)}>
            <SheetHeader title={`Report ${person.row.name}`} onDone={() => setReporting(false)} doneLabel="Cancel" />
            <ScrollView contentContainerStyle={styles.reportOptions}>
              {REPORTS.map((item) => (
                <Pressable
                  key={item.reason}
                  onPress={() => { void sendReport(item.reason); }}
                  disabled={busy}
                  accessibilityRole="button"
                  style={Ui.textButton}>
                  <ThemedText>{item.label}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </BottomSheet>
          <CreditLine lastfm={false} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  back: { ...Ui.textButton, alignSelf: 'flex-start', marginBottom: Spacing.sm },
  print: { alignItems: 'center', paddingVertical: Spacing.lg },
  mode: { alignSelf: 'flex-start', backgroundColor: Colors.surface, borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  modeText: { ...Ui.label },
  dim: { color: Colors.textSecondary },
  waveBox: { borderWidth: 1, borderColor: Colors.hairline, borderRadius: Radius.sm,
    padding: Spacing.lg, gap: Spacing.sm, marginTop: Spacing.md },
  wavedAtYou: { fontFamily: Fonts.sansSemiBold, fontSize: 13, color: Colors.text },
  contact: { gap: Spacing.md },
  contactText: { fontFamily: Fonts.sansBold, fontSize: 16 },
  primary: { ...Ui.outlineButton, backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryText: { ...Ui.label, color: Colors.accentText },
  section: { marginTop: Spacing.xl, marginBottom: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', paddingVertical: 6 },
  artWrap: { width: 56, height: 56 },
  art: { width: 56, height: 56, borderRadius: Radius.sm },
  playBadge: { position: 'absolute', right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontFamily: Fonts.sansBold, fontSize: 15, lineHeight: 19 },
  links: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.xl },
  reportOptions: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.sm },
  link: { color: Colors.textSecondary, textDecorationLine: 'underline' },
});
