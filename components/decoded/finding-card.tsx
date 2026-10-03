import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import { artworkUrl } from '@/lib/discovery';
import { SIDE_WORDS, type DecodedSong, type Finding } from '@/lib/taste-decoded';

const COVER = 36;

type Props = {
  index: number;
  finding: Finding;
  vote: boolean | undefined;
  playingId: number | null;
  onPlay: (song: DecodedSong) => void;
  onVote: (agree: boolean) => void;
};

/** One finding: the sentence, a bar with the genre's normal shaded and your songs sliding out to where they sit, and the vote. */
export function FindingCard({ index, finding, vote, playingId, onPlay, onVote }: Props) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (width) progress.set(withSpring(1, { damping: 14, stiffness: 90 }));
  }, [width, progress]);
  const words = SIDE_WORDS[finding.measure];
  const n = finding.evidence.length;

  return (
    <View style={styles.card}>
      <ThemedText style={styles.number}>{String(index + 1).padStart(2, '0')}</ThemedText>
      <ThemedText style={styles.sentence}>{finding.sentence}</ThemedText>
      <View style={styles.bar} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track} />
        <View style={styles.normal} />
        {width > 0 &&
          finding.evidence.map((e, i) => (
            <Cover
              key={e.song.id}
              song={e.song}
              x={(e.position / 100) * width}
              center={width / 2}
              row={i % 2}
              progress={progress}
              playing={playingId === e.song.id}
              onPress={() => onPlay(e.song)}
            />
          ))}
      </View>
      <View style={styles.ends}>
        <ThemedText style={styles.end}>{words.low}</ThemedText>
        <ThemedText style={styles.end}>{words.high}</ThemedText>
      </View>
      <ThemedText style={styles.based}>
        Based on {n} {n === 1 ? 'song' : 'songs'}
      </ThemedText>
      <View style={styles.votes}>
        <VoteButton label="Sounds like me" on={vote === true} onPress={() => onVote(true)} />
        <VoteButton label="Nope" on={vote === false} onPress={() => onVote(false)} />
      </View>
    </View>
  );
}

function Cover(props: {
  song: DecodedSong;
  x: number;
  center: number;
  row: number;
  progress: SharedValue<number>;
  playing: boolean;
  onPress: () => void;
}) {
  const { song, x, center, row, progress, playing, onPress } = props;
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: center + (x - center) * progress.get() - COVER / 2 }] }));
  return (
    <Animated.View style={[styles.cover, { top: row * Math.round(COVER * 0.6) }, slide]}>
      <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Play ${song.title} by ${song.artist}`}>
        <Image source={{ uri: artworkUrl(song.artworkUrl, 100) }} style={[styles.art, playing && styles.playing]} />
      </Pressable>
    </Animated.View>
  );
}

function VoteButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[Ui.outlineButton, on && styles.voteOn]}>
      <ThemedText style={styles.voteText}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm, paddingVertical: Spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.rule },
  number: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textTertiary },
  sentence: { fontFamily: Fonts.display, fontSize: 24, lineHeight: 28, color: Colors.text },
  bar: { height: COVER + Math.round(COVER * 0.6), marginTop: Spacing.sm },
  track: { position: 'absolute', left: 0, right: 0, top: 28, height: 2, backgroundColor: Colors.rule },
  normal: { position: 'absolute', left: '25%', width: '50%', top: 21, height: 16, borderRadius: Radius.sm, backgroundColor: Colors.surface },
  cover: { position: 'absolute', left: 0 },
  art: { width: COVER, height: COVER, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.hairline },
  playing: { borderWidth: 2, borderColor: Colors.text },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { ...Ui.label, color: Colors.textSecondary },
  based: { fontSize: 13, color: Colors.textTertiary },
  votes: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  voteOn: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.text },
  voteText: { ...Ui.label },
});
