import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppleMusicLink, LastfmLink, SpotifyLink } from '@/components/credits';
import { CallButton } from '@/components/discovery/call-button';
import { HumanBadge } from '@/components/human-badge';
import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing, Ui } from '@/constants/theme';
import { useSound } from '@/hooks/use-sound';
import { artworkUrl, describeListeners, type DiscoveryTrack } from '@/lib/discovery';
import { describeSound } from '@/lib/sound';

type Props = {
  visible: boolean;
  track: DiscoveryTrack | null;
  /** The artist's Last.fm listeners: undefined while loading, null if unknown. */
  listeners: number | null | undefined;
  onSave?: (track: DiscoveryTrack) => Promise<void>;
  onClose: () => void;
};

/** Everything about a revealed song that doesn't fit on the card: the big cover, links, Call it, how it sounds, comments. */
export function DetailsSheet({ visible, track, listeners, onSave, onClose }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { record } = useSound(visible ? track : null);
  if (!track) return null;
  const described = listeners != null ? describeListeners(listeners) : null;
  const side = Math.min(width, 520) - Spacing.xl * 2;
  const sound = record?.status === 'measured' ? describeSound(record.features) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Image source={{ uri: artworkUrl(track.artworkUrl100, 600) }} style={[styles.cover, { width: side, height: side }]} />
            <ThemedText type="subtitle">{track.trackName}</ThemedText>
            <ThemedText style={styles.secondary}>{track.artistName}</ThemedText>
            <HumanBadge artist={track.artistName} />

            <View style={styles.links}>
              <AppleMusicLink trackId={track.id} url={track.trackViewUrl} />
              <SpotifyLink artist={track.artistName} title={track.trackName} />
              {described && <LastfmLink artist={track.artistName} />}
            </View>

            <ThemedText style={[Ui.label, styles.heading]}>Listeners</ThemedText>
            <ThemedText style={styles.secondary}>
              {described ? `${described.count} listeners · ${described.verdict}` : listeners === undefined ? 'Counting…' : 'Last.fm has no count for this artist yet.'}
            </ThemedText>
            <View style={styles.callRow}>
              <CallButton track={track} listeners={listeners} onSave={onSave} />
            </View>
            <ThemedText type="caption">Call it: we’ll tell you if they blow up. 3 a week.</ThemedText>

            <ThemedText style={[Ui.label, styles.heading]}>The sound</ThemedText>
            {sound ? (
              <>
                {sound.map((line) => (
                  <ThemedText key={line}>{line}</ThemedText>
                ))}
                <ThemedText style={styles.source}>Measured by ReccoBeats.</ThemedText>
              </>
            ) : (
              <ThemedText style={styles.secondary}>No sound data for this song yet.</ThemedText>
            )}

            <Pressable
              style={[Ui.outlineButton, styles.comments]}
              onPress={() => {
                onClose();
                router.push({ pathname: '/comments', params: { trackId: String(track.id), title: track.trackName, artist: track.artistName } });
              }}>
              <Ionicons name="chatbubble-outline" size={18} color={Colors.text} />
              <ThemedText style={Ui.label}>Comments</ThemedText>
            </Pressable>

            <Pressable style={[Ui.textButton, styles.close]} onPress={onClose} accessibilityRole="button">
              <ThemedText style={[Ui.label, styles.secondary]}>Close</ThemedText>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.hairline,
    borderTopLeftRadius: Radius.md,
    borderTopRightRadius: Radius.md,
  },
  body: { padding: Spacing.xl, paddingBottom: Spacing.xxl, gap: Spacing.xs },
  cover: { borderRadius: Radius.sm, marginBottom: Spacing.md, alignSelf: 'center' },
  secondary: { color: Colors.textSecondary },
  links: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
  heading: { marginTop: Spacing.lg },
  callRow: { flexDirection: 'row', marginTop: Spacing.xs },
  source: { color: Colors.textTertiary, marginTop: Spacing.xs },
  comments: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  close: { alignSelf: 'center', marginTop: Spacing.sm },
});
