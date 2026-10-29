import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppleMusicLink, CreditLine, LastfmLink, SpotifyLink } from '@/components/credits';
import { CallButton } from '@/components/discovery/call-button';
import { HumanBadge } from '@/components/human-badge';
import { ThemedText } from '@/components/themed-text';
import { BottomSheet, sheetStyles } from '@/components/ui/sheet';
import { Colors, Fonts, Spacing, TapTarget, Typography, Ui } from '@/constants/theme';
import { useSound } from '@/hooks/use-sound';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { listenerMeter } from '@/lib/home-copy';
import { describeSound } from '@/lib/sound';
import { releaseLine } from '@/lib/song-age';

type Props = {
  visible: boolean;
  track: DiscoveryTrack | null;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  onSave?: (track: DiscoveryTrack) => Promise<void>;
  onClose: () => void;
};

/**
 * Everything about a revealed song that doesn't fit under the card: the big
 * cover, where to listen, how many people do, Call it, how it sounds,
 * comments and the credits.
 */
export function DetailsSheet({ visible, track, listeners, onSave, onClose }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { record } = useSound(visible ? track : null);
  if (!track) return null;
  const described = listeners != null ? describeListeners(listeners) : null;
  const side = Math.min(width, 520) - Spacing.xl * 2;
  const sound = record?.status === 'measured' ? describeSound(record.features) : null;
  const release = releaseLine(track.releaseDate, track.collectionName);
  const meter = listeners != null ? listenerMeter(listeners) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={[styles.cover, { width: side, height: side }]} />
        <ThemedText type="subtitle">{track.trackName}</ThemedText>
        <ThemedText style={styles.secondary}>{release ? `${track.artistName} · ${release}` : track.artistName}</ThemedText>
        <HumanBadge artist={track.artistName} />

        <ThemedText style={sheetStyles.heading}>Listen on</ThemedText>
        <View style={styles.links}>
          <AppleMusicLink trackId={track.id} url={track.trackViewUrl} />
          <SpotifyLink artist={track.artistName} title={track.trackName} />
          {described && <LastfmLink artist={track.artistName} />}
        </View>

        <ThemedText style={sheetStyles.heading}>Listeners</ThemedText>
        {described ? (
          <>
            <ThemedText style={styles.count}>
              {described.count} <ThemedText style={styles.verdict}>· {described.verdict.replace(/\.$/, '')}</ThemedText>
            </ThemedText>
            <View
              style={styles.meter}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="How well-known, from hidden gem to popular"
              accessibilityValue={{ min: 0, max: 100, now: Math.round((meter ?? 0) * 100) }}>
              <View style={styles.meterTrack} />
              <View style={[styles.meterDot, { left: `${Math.round((meter ?? 0) * 100)}%` }]} />
            </View>
            <View style={styles.meterLabels}>
              <ThemedText style={styles.small}>Hidden gem</ThemedText>
              <ThemedText style={styles.small}>Popular</ThemedText>
            </View>
          </>
        ) : (
          <ThemedText style={styles.secondary}>{listeners === undefined ? 'Counting…' : 'Last.fm has no count for this artist yet.'}</ThemedText>
        )}

        <View style={[sheetStyles.card, styles.callCard]}>
          <ThemedText style={styles.callTitle}>Think they’ll blow up?</ThemedText>
          <ThemedText style={styles.secondary}>Call it and we’ll tell you if they do. 3 calls a week.</ThemedText>
          <View style={styles.callRow}>
            <CallButton track={track} listeners={listeners} onSave={onSave} />
          </View>
        </View>

        <ThemedText style={sheetStyles.heading}>The sound</ThemedText>
        {sound ? (
          <>
            <View style={styles.tiles}>
              {sound.map((line) => (
                <View key={line} style={styles.tile}>
                  <ThemedText style={styles.tileText}>{line}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText style={styles.small}>Measured by ReccoBeats.</ThemedText>
          </>
        ) : (
          <ThemedText style={styles.secondary}>No sound data for this song yet.</ThemedText>
        )}

        <Pressable
          style={[Ui.outlineButton, styles.comments]}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push({ pathname: '/comments', params: { trackId: String(track.id), title: track.trackName, artist: track.artistName } });
          }}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.text} />
          <ThemedText style={Ui.label}>Comments</ThemedText>
        </Pressable>

        <View style={styles.credit}>
          <CreditLine lastfm={!!described} />
        </View>

        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
          <ThemedText style={styles.closeText}>Close</ThemedText>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.xs },
  cover: { borderRadius: 20, marginBottom: Spacing.md, alignSelf: 'center' },
  secondary: { fontSize: 15, lineHeight: 21, color: Colors.textSecondary },
  links: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  count: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 34, color: Colors.text },
  verdict: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.textSecondary },
  meter: { height: 14, justifyContent: 'center', marginTop: Spacing.xs },
  meterTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.surface },
  meterDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: Colors.text },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontSize: 13, lineHeight: 17, color: Colors.textSecondary },
  callCard: { marginTop: Spacing.lg },
  callTitle: { fontFamily: Fonts.sansSemiBold, fontSize: 16, lineHeight: 21 },
  callRow: { flexDirection: 'row', marginTop: Spacing.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xs },
  tile: { backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tileText: { fontFamily: Fonts.sansSemiBold, fontSize: 14, lineHeight: 18 },
  comments: { alignSelf: 'flex-start', marginTop: Spacing.lg },
  credit: { marginTop: Spacing.lg },
  close: { alignSelf: 'center', minHeight: TapTarget, justifyContent: 'center', paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  closeText: { ...Typography.label, color: Colors.textSecondary },
});
