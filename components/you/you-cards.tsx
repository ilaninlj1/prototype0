import { FontAwesome, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import type { ReactNode, RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts, Radius, Spacing, Ui } from '@/constants/theme';
import type { Tier } from '@/lib/you-stats';

// The You page's cards: each one big number and one plain sentence, so a lot of data
// still reads at a glance. The iceberg, receipt and festival poster are drawn exactly as
// they're shared, like the Decoded share card.

/** Saves a card as a picture and opens the share sheet. */
export async function shareCard(ref: RefObject<View | null>, title: string) {
  try {
    const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: title });
  } catch {
    // The share sheet was closed, or sharing isn't available here.
  }
}

export function ShareButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[Ui.outlineButton, styles.share]} accessibilityRole="button">
      <Ionicons name="share-outline" size={16} color={Colors.text} />
      <ThemedText style={Ui.label}>{label}</ThemedText>
    </Pressable>
  );
}

/** A section: small label, then its content, on a thin rule. */
export function Section({ label, spotify, children }: { label: string; spotify?: boolean; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {spotify && <FontAwesome name="spotify" size={13} color={Colors.textSecondary} />}
        <ThemedText type="eyebrow">{label}</ThemedText>
      </View>
      {children}
    </View>
  );
}

/** One big number and its sentence. */
export function Stat({ big, line }: { big: string; line: ReactNode }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statBig}>{big}</ThemedText>
      <ThemedText style={styles.line}>{line}</ThemedText>
    </View>
  );
}

export function TypeBadge({ name, why }: { name: string; why: string }) {
  return (
    <View style={styles.type}>
      <View style={styles.typePill}>
        <View style={styles.dot} />
        <ThemedText style={styles.typeName}>{name}</ThemedText>
      </View>
      <ThemedText style={styles.dim}>{why}</ThemedText>
    </View>
  );
}

export function Tiles({ tiles }: { tiles: { big: string; label: string }[] }) {
  return (
    <View style={styles.tiles}>
      {tiles.map((t) => (
        <View key={t.label} style={styles.tile}>
          <ThemedText style={styles.tileBig} numberOfLines={1} adjustsFontSizeToFit>
            {t.big}
          </ThemedText>
          <ThemedText style={styles.tileLabel}>{t.label}</ThemedText>
        </View>
      ))}
    </View>
  );
}

/** 24 thin bars, one per hour of the day; the busiest hours in red. */
export function Clock({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  const top = [...hours].sort((a, b) => b - a)[2] ?? 0;
  return (
    <View>
      <View style={styles.clock}>
        {hours.map((n, h) => (
          <View
            key={h}
            style={[styles.clockBar, { height: 4 + (n / max) * 44 }, n > 0 && n >= top && { backgroundColor: Colors.signal }]}
          />
        ))}
      </View>
      <View style={styles.clockAxis}>
        {['12am', '6am', '12pm', '6pm', '12am'].map((l, i) => (
          <ThemedText key={i} style={styles.axis}>
            {l}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars with a label and a share, for decades. */
export function Bars({ rows }: { rows: { label: string; share: number; count: number }[] }) {
  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <ThemedText style={styles.barLabel}>{r.label}</ThemedText>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(2, r.share * 100)}%` }]} />
          </View>
          <ThemedText style={styles.barCount}>{Math.round(r.share * 100)}%</ThemedText>
        </View>
      ))}
    </View>
  );
}

// ---------- Share cards ----------

const LAYER = {
  Famous: { width: '46%', bg: Colors.text, fg: Colors.accentText, note: '1M+' },
  Known: { width: '66%', bg: '#2b4a7d', fg: Colors.text, note: '100K+' },
  Deep: { width: '84%', bg: '#203a68', fg: Colors.text, note: '10K+' },
  Buried: { width: '100%', bg: '#152a4f', fg: Colors.text, note: 'under 10K' },
} as const;

/** Your blind finds as an iceberg: famous above the water, buried at the bottom. */
export function IcebergCard({ cardRef, tiers }: { cardRef: RefObject<View | null>; tiers: Tier[] }) {
  return (
    <View ref={cardRef} collapsable={false} style={styles.shareCard}>
      <ThemedText style={styles.shareEyebrow}>My Blindspot iceberg</ThemedText>
      <View style={styles.iceberg}>
        {tiers.map((t) => {
          const l = LAYER[t.name];
          const names = t.artists.slice(0, 4).map((a) => a.artist);
          const more = t.artists.length - names.length;
          return (
            <View key={t.name} style={styles.layerWrap}>
              <View style={[styles.layer, { width: l.width, backgroundColor: l.bg }]}>
                <ThemedText style={[styles.layerName, { color: l.fg }]}>
                  {t.name} · {l.note}
                </ThemedText>
                <ThemedText style={[styles.layerArtists, { color: l.fg }]} numberOfLines={2}>
                  {names.length ? names.join(' · ') : '—'}
                  {more > 0 ? ` +${more}` : ''}
                </ThemedText>
              </View>
              {t.name === 'Famous' && (
                <View style={styles.water}>
                  <View style={styles.waterLine} />
                  <ThemedText style={styles.waterText}>the surface</ThemedText>
                  <View style={styles.waterLine} />
                </View>
              )}
            </View>
          );
        })}
      </View>
      <ThemedText style={styles.shareFoot}>Every artist found blind on Blindspot</ThemedText>
    </View>
  );
}

/** Your latest finds as a store receipt, each priced at its artist's listeners. */
export function ReceiptCard({
  cardRef,
  lines,
  total,
  median,
  date,
}: {
  cardRef: RefObject<View | null>;
  lines: { song: string; artist: string; price: string }[];
  total: number;
  median: string | null;
  date: string;
}) {
  return (
    <View ref={cardRef} collapsable={false} style={styles.receipt}>
      <ThemedText style={styles.receiptTitle}>BLINDSPOT</ThemedText>
      <ThemedText style={styles.receiptMono}>RECEIPT OF FINDS · {date.toUpperCase()}</ThemedText>
      <ThemedText style={styles.receiptRule}>- - - - - - - - - - - - - - - - - - - -</ThemedText>
      <View style={styles.receiptHead}>
        <ThemedText style={styles.receiptMono}>SONG</ThemedText>
        <ThemedText style={styles.receiptMono}>LISTENERS</ThemedText>
      </View>
      {lines.map((l, i) => (
        <View key={i} style={styles.receiptRow}>
          <View style={styles.receiptItem}>
            <ThemedText style={styles.receiptMonoBold} numberOfLines={1}>
              {l.song.toUpperCase()}
            </ThemedText>
            <ThemedText style={styles.receiptMono} numberOfLines={1}>
              {l.artist}
            </ThemedText>
          </View>
          <ThemedText style={styles.receiptMonoBold}>{l.price}</ThemedText>
        </View>
      ))}
      <ThemedText style={styles.receiptRule}>- - - - - - - - - - - - - - - - - - - -</ThemedText>
      <View style={styles.receiptHead}>
        <ThemedText style={styles.receiptMonoBold}>FOUND BLIND</ThemedText>
        <ThemedText style={styles.receiptMonoBold}>{total}</ThemedText>
      </View>
      {median && (
        <View style={styles.receiptHead}>
          <ThemedText style={styles.receiptMono}>MEDIAN LISTENERS</ThemedText>
          <ThemedText style={styles.receiptMono}>{median}</ThemedText>
        </View>
      )}
      <View style={styles.barcode}>
        {Array.from({ length: 34 }, (_, i) => (
          <View key={i} style={[styles.barcodeLine, { width: (i * 7) % 3 === 0 ? 3 : 1 }]} />
        ))}
      </View>
      <ThemedText style={styles.receiptThanks}>THANK YOU FOR LISTENING BLIND</ThemedText>
    </View>
  );
}

/** Your most-saved Spotify artists as a festival lineup: headliners big, then smaller rows. */
export function PosterCard({ cardRef, artists, year }: { cardRef: RefObject<View | null>; artists: string[]; year: number }) {
  const rows = [artists.slice(0, 3), artists.slice(3, 9), artists.slice(9, 18)];
  return (
    <View ref={cardRef} collapsable={false} style={styles.poster}>
      <ThemedText style={styles.posterEyebrow}>Blindspot presents</ThemedText>
      <ThemedText style={styles.posterTitle}>MY FEST {year}</ThemedText>
      <View style={styles.posterRule} />
      {rows.map(
        (row, i) =>
          row.length > 0 && (
            <ThemedText
              key={i}
              style={[styles.posterRow, i === 0 ? styles.posterHead : i === 1 ? styles.posterMid : styles.posterSmall]}
              numberOfLines={i === 0 ? 3 : 4}
              adjustsFontSizeToFit>
              {/* Non-breaking spaces inside names: a line only breaks between artists, never inside one. */}
              {row.map((a) => a.replace(/ /g, '\u00A0')).join('  ·  ')}
            </ThemedText>
          )
      )}
      <View style={styles.posterRule} />
      <ThemedText style={styles.posterFoot}>Lineup from my Spotify library, by most saved</ThemedText>
    </View>
  );
}

const MONO = { fontFamily: Fonts.mono, color: Colors.accentText, fontSize: 12, lineHeight: 17 } as const;

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stat: { gap: 2 },
  statBig: { fontFamily: Fonts.display, fontSize: 44, lineHeight: 48, color: Colors.signal, fontVariant: ['tabular-nums'] },
  line: { fontSize: 17, lineHeight: 24 },
  dim: { color: Colors.textSecondary },
  share: { alignSelf: 'flex-start' },

  type: { gap: Spacing.xs },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.round,
  },
  dot: { width: 8, height: 8, borderRadius: Radius.round, backgroundColor: Colors.signal },
  typeName: { ...Ui.label, fontSize: 13 },

  tiles: { flexDirection: 'row', gap: Spacing.sm },
  tile: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.hairline,
    borderRadius: Radius.md,
    gap: 2,
  },
  tileBig: { fontFamily: Fonts.display, fontSize: 28, lineHeight: 32, color: Colors.signal, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 12, lineHeight: 15, color: Colors.textSecondary },

  clock: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 48 },
  clockBar: { flex: 1, borderRadius: 2, backgroundColor: Colors.hairline },
  clockAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axis: { ...Ui.label, fontSize: 9, color: Colors.textTertiary },

  bars: { gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  barLabel: { ...Ui.label, fontSize: 11, width: 46 },
  barTrack: { flex: 1, height: 10, borderRadius: Radius.sm, backgroundColor: Colors.surface, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: Colors.text },
  barCount: { ...Ui.label, fontSize: 11, width: 36, textAlign: 'right', color: Colors.textSecondary },

  shareCard: {
    padding: Spacing.lg,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.hairline,
    backgroundColor: Colors.background,
  },
  shareEyebrow: { ...Ui.label, color: Colors.textSecondary },
  shareFoot: { fontSize: 12, lineHeight: 16, color: Colors.textTertiary, textAlign: 'center' },
  iceberg: { alignItems: 'center', gap: 4 },
  layerWrap: { width: '100%', alignItems: 'center', gap: 4 },
  layer: { borderRadius: Radius.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: 2 },
  layerName: { ...Ui.label, fontSize: 10, letterSpacing: 0.8 },
  layerArtists: { fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  water: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, width: '100%', marginVertical: 2 },
  waterLine: { flex: 1, height: 1, backgroundColor: Colors.text, opacity: 0.6 },
  waterText: { ...Ui.label, fontSize: 9, color: Colors.textSecondary },

  receipt: { padding: Spacing.lg, gap: 4, borderRadius: Radius.sm, backgroundColor: Colors.text, alignSelf: 'stretch' },
  receiptTitle: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 30, color: Colors.accentText, textAlign: 'center' },
  receiptMono: { ...MONO },
  receiptMonoBold: { ...MONO, fontFamily: Fonts.monoMedium },
  receiptRule: { ...MONO, textAlign: 'center', opacity: 0.6 },
  receiptHead: { flexDirection: 'row', justifyContent: 'space-between' },
  receiptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: 2 },
  receiptItem: { flex: 1 },
  barcode: { flexDirection: 'row', justifyContent: 'center', gap: 2, height: 32, marginTop: Spacing.sm },
  barcodeLine: { height: 32, backgroundColor: Colors.accentText },
  receiptThanks: { ...MONO, textAlign: 'center', marginTop: 4 },

  poster: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.signal,
    alignItems: 'center',
  },
  posterEyebrow: { ...Ui.label, color: Colors.text, opacity: 0.85 },
  posterTitle: { fontFamily: Fonts.display, fontSize: 36, lineHeight: 40, color: Colors.text, letterSpacing: -0.5 },
  posterRule: { height: 2, width: '60%', backgroundColor: Colors.text, opacity: 0.7, marginVertical: 4 },
  posterRow: { color: Colors.text, textAlign: 'center' },
  posterHead: { fontFamily: Fonts.display, fontSize: 26, lineHeight: 31 },
  posterMid: { fontFamily: Fonts.displayBold, fontSize: 17, lineHeight: 23 },
  posterSmall: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  posterFoot: { fontSize: 11, lineHeight: 15, color: Colors.text, opacity: 0.85 },
});
