import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { proofLine } from '@/lib/human-check';
import { humanProof, isAiArtist, reportAi } from '@/lib/human-check-api';

const reportedThisSession = new Set<string>();

/**
 * One line under a revealed artist: proof they're a real person when there is
 * some ("Real person · 12 shows on record · on vinyl or CD"), a plain label when
 * listeners have tagged them as AI, and a quiet "Sounds like AI?" report.
 * Finding no proof says nothing — small real artists are never accused.
 */
export function HumanBadge({ artist }: { artist: string }) {
  const [ai, setAi] = useState<boolean | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [reported, setReported] = useState(reportedThisSession.has(artist));

  useEffect(() => {
    let live = true;
    isAiArtist(artist).then((isAi) => {
      if (!live) return;
      setAi(isAi);
      if (!isAi) humanProof(artist).then((p) => live && setProof(proofLine(p)));
    });
    return () => {
      live = false;
    };
  }, [artist]);

  function report() {
    reportedThisSession.add(artist);
    setReported(true);
    reportAi(artist);
  }

  return (
    <View style={styles.row}>
      {ai ? (
        <ThemedText style={[styles.text, styles.ai]}>AI-tagged by listeners</ThemedText>
      ) : proof ? (
        <ThemedText style={styles.text}>{proof}</ThemedText>
      ) : (
        <View />
      )}
      {ai === false &&
        (reported ? (
          <ThemedText style={styles.text}>Thanks, noted</ThemedText>
        ) : (
          <Pressable onPress={report} hitSlop={8}>
            <ThemedText style={[styles.text, styles.link]}>Sounds like AI?</ThemedText>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginTop: Spacing.xs, minHeight: 16 },
  text: { fontFamily: Fonts.mono, fontSize: 11, lineHeight: 14, color: Colors.textSecondary, flexShrink: 1 },
  ai: { color: Colors.highlight },
  link: { textDecorationLine: 'underline', color: Colors.textTertiary },
});
