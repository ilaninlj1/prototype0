import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  GENRES,
  PICKS_PER_SIDE,
  type PoolTrack,
  type Rating,
  type RatedTrack,
  appendHistoryEntry,
  buildSessionQueue,
  dedupeById,
  fetchGenreTracks,
  formatSeconds,
  isMismatch,
  loadGenrePicks,
  saveGenrePicks,
} from '@/lib/taste-test';

type Screen = 'setup' | 'playing' | 'reveal' | 'summary';

export default function HomeScreen() {
  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState<Screen>('setup');

  const [likedGenres, setLikedGenres] = useState<string[]>([]);
  const [dislikedGenres, setDislikedGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [queue, setQueue] = useState<PoolTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ratings, setRatings] = useState<RatedTrack[]>([]);

  const currentTrack = queue[currentIndex];
  const lastRated = ratings[ratings.length - 1];

  // Audio player — created once, source swapped via replace().
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (screen === 'playing' && currentTrack) {
      player.replace(currentTrack.previewUrl);
    } else {
      player.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, currentTrack?.previewUrl]);

  // ---------- Fetch + build a session for a given pair of genre picks ----------

  async function startSession(liked: string[], disliked: string[]) {
    setLoading(true);
    setError(null);
    try {
      await saveGenrePicks({ liked, disliked });

      const likedResults = await Promise.all(liked.map((g) => fetchGenreTracks(g, 'liked')));
      const dislikedResults = await Promise.all(
        disliked.map((g) => fetchGenreTracks(g, 'disliked'))
      );

      const likedPool = dedupeById(likedResults.flat());
      const dislikedPool = dedupeById(dislikedResults.flat());

      if (likedPool.length === 0 || dislikedPool.length === 0) {
        setError('Could not find enough previews for those genres. Try different genres.');
        setScreen('setup');
        return;
      }

      const finalQueue = buildSessionQueue(likedPool, dislikedPool);

      setQueue(finalQueue);
      setCurrentIndex(0);
      setRatings([]);
      setScreen('playing');
    } catch {
      setError('Something went wrong fetching tracks. Check your connection and try again.');
      setScreen('setup');
    } finally {
      setLoading(false);
    }
  }

  // ---------- Bootstrap: resume straight into playing if picks are already saved ----------

  useEffect(() => {
    (async () => {
      const picks = await loadGenrePicks();
      if (picks && picks.liked.length === PICKS_PER_SIDE && picks.disliked.length === PICKS_PER_SIDE) {
        setLikedGenres(picks.liked);
        setDislikedGenres(picks.disliked);
        await startSession(picks.liked, picks.disliked);
      }
      setHydrated(true);
    })();
  }, []);

  // If picks get cleared elsewhere (the profile tab's "redo setup"), snap back to setup
  // whenever this tab regains focus. A no-op while picks are still saved, so it never
  // interrupts an in-progress session from ordinary tab switching.
  useFocusEffect(
    useCallback(() => {
      if (!hydrated) return;
      let cancelled = false;
      (async () => {
        const picks = await loadGenrePicks();
        if (cancelled || picks) return;
        setScreen('setup');
        setLikedGenres([]);
        setDislikedGenres([]);
        setQueue([]);
        setCurrentIndex(0);
        setRatings([]);
        player.pause();
      })();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated])
  );

  // ---------- Setup handlers ----------

  function toggleLiked(genre: string) {
    if (dislikedGenres.includes(genre)) return;
    setLikedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length < PICKS_PER_SIDE
          ? [...prev, genre]
          : prev
    );
  }

  function toggleDisliked(genre: string) {
    if (likedGenres.includes(genre)) return;
    setDislikedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : prev.length < PICKS_PER_SIDE
          ? [...prev, genre]
          : prev
    );
  }

  function handleStart() {
    startSession(likedGenres, dislikedGenres);
  }

  // ---------- Playing handlers ----------

  function togglePlayPause() {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  function handleRate(rating: Rating) {
    if (!currentTrack) return;
    player.pause();
    const rated: RatedTrack = { ...currentTrack, rating };
    setRatings((prev) => [...prev, rated]);
    setScreen('reveal');
    appendHistoryEntry({ ...rated, timestamp: Date.now() });
  }

  // ---------- Reveal handlers ----------

  function handleNext() {
    if (currentIndex + 1 < queue.length) {
      setCurrentIndex((i) => i + 1);
      setScreen('playing');
    } else {
      setScreen('summary');
    }
  }

  // ---------- Restart ----------

  function handleRestart() {
    player.pause();
    setScreen('setup');
    setLikedGenres([]);
    setDislikedGenres([]);
    setQueue([]);
    setCurrentIndex(0);
    setRatings([]);
    setError(null);
  }

  // ---------- Render ----------

  if (!hydrated) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (screen === 'setup') {
    const canStart = likedGenres.length === PICKS_PER_SIDE && dislikedGenres.length === PICKS_PER_SIDE;

    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          <ThemedText type="title">Blind Taste Test</ThemedText>
          <ThemedText>
            Pick {PICKS_PER_SIDE} genres you like and {PICKS_PER_SIDE} you dislike. You&apos;ll
            hear 10 previews with no info shown, rate each 1–5, then see if your ratings matched
            what you said.
          </ThemedText>

          <ThemedText type="subtitle" style={styles.sectionTitle}>
            I like ({likedGenres.length}/{PICKS_PER_SIDE})
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            {GENRES.map((g) => {
              const selected = likedGenres.includes(g);
              const disabled = dislikedGenres.includes(g);
              return (
                <TouchableOpacity
                  key={`like-${g}`}
                  disabled={disabled}
                  onPress={() => toggleLiked(g)}
                  activeOpacity={0.7}>
                  <ThemedView
                    style={styles.chip}
                    lightColor={selected ? '#e0f7ec' : disabled ? '#eee' : '#f2f2f2'}
                    darkColor={selected ? '#1d3d2f' : disabled ? '#1c1c1c' : '#242424'}>
                    <ThemedText style={disabled ? styles.chipTextDisabled : undefined}>
                      {g}
                    </ThemedText>
                  </ThemedView>
                </TouchableOpacity>
              );
            })}
          </ThemedView>

          <ThemedText type="subtitle" style={styles.sectionTitle}>
            I dislike ({dislikedGenres.length}/{PICKS_PER_SIDE})
          </ThemedText>
          <ThemedView style={styles.chipRow}>
            {GENRES.map((g) => {
              const selected = dislikedGenres.includes(g);
              const disabled = likedGenres.includes(g);
              return (
                <TouchableOpacity
                  key={`dislike-${g}`}
                  disabled={disabled}
                  onPress={() => toggleDisliked(g)}
                  activeOpacity={0.7}>
                  <ThemedView
                    style={styles.chip}
                    lightColor={selected ? '#fdeaea' : disabled ? '#eee' : '#f2f2f2'}
                    darkColor={selected ? '#3d1d1d' : disabled ? '#1c1c1c' : '#242424'}>
                    <ThemedText style={disabled ? styles.chipTextDisabled : undefined}>
                      {g}
                    </ThemedText>
                  </ThemedView>
                </TouchableOpacity>
              );
            })}
          </ThemedView>

          {error && <ThemedText style={styles.errorText}>{error}</ThemedText>}

          <TouchableOpacity onPress={handleStart} disabled={!canStart || loading} activeOpacity={0.7}>
            <ThemedView
              style={styles.primaryButton}
              lightColor={canStart ? '#0a7ea4' : '#ccc'}
              darkColor={canStart ? '#0a7ea4' : '#333'}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.primaryButtonText}>Start Blind Test</ThemedText>
              )}
            </ThemedView>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
    );
  }

  if (screen === 'playing') {
    if (!currentTrack) {
      return (
        <ThemedView style={styles.container}>
          <ThemedText>No track loaded.</ThemedText>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.container}>
        <ThemedText type="defaultSemiBold">
          Track {currentIndex + 1} of {queue.length}
        </ThemedText>

        <ThemedView style={styles.playerArea}>
          <TouchableOpacity onPress={togglePlayPause} activeOpacity={0.8}>
            <ThemedView style={styles.bigPlayButton} lightColor="#0a7ea4" darkColor="#0a7ea4">
              <ThemedText style={styles.bigPlayIcon}>{status.playing ? '⏸' : '▶'}</ThemedText>
            </ThemedView>
          </TouchableOpacity>

          <ThemedText style={styles.timeText}>
            {formatSeconds(status.currentTime)} / {formatSeconds(status.duration || 30)}
          </ThemedText>
          {!status.isLoaded && <ThemedText style={styles.loadingText}>Loading preview…</ThemedText>}
        </ThemedView>

        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Rate this track
        </ThemedText>
        <ThemedView style={styles.ratingRow}>
          {([1, 2, 3, 4, 5] as Rating[]).map((n) => (
            <TouchableOpacity key={n} onPress={() => handleRate(n)} activeOpacity={0.7}>
              <ThemedView style={styles.ratingButton} lightColor="#f2f2f2" darkColor="#242424">
                <ThemedText type="defaultSemiBold" style={styles.ratingButtonText}>
                  {n}
                </ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>
      </ThemedView>
    );
  }

  if (screen === 'reveal') {
    if (!lastRated) {
      return (
        <ThemedView style={styles.container}>
          <ThemedText>Nothing to reveal.</ThemedText>
        </ThemedView>
      );
    }

    const mismatch = isMismatch(lastRated);

    return (
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <ThemedView style={styles.container}>
          {lastRated.artworkUrl100 ? (
            <Image source={{ uri: lastRated.artworkUrl100 }} style={styles.artwork} />
          ) : null}

          <ThemedText type="subtitle">{lastRated.trackName}</ThemedText>
          <ThemedText>{lastRated.artistName}</ThemedText>
          <ThemedText>{lastRated.primaryGenreName}</ThemedText>

          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            This was from your {lastRated.pool === 'liked' ? 'LIKED' : 'DISLIKED'} pool — you said
            you {lastRated.pool === 'liked' ? 'like' : 'dislike'} {lastRated.sourceGenre}
          </ThemedText>
          <ThemedText>You rated it {lastRated.rating}/5</ThemedText>

          {mismatch && (
            <ThemedView style={styles.mismatchBanner} lightColor="#fff3cd" darkColor="#4d3b00">
              <ThemedText style={styles.mismatchTitle}>⚠️ Mismatch!</ThemedText>
              <ThemedText>
                {lastRated.pool === 'disliked'
                  ? `You said you dislike ${lastRated.sourceGenre}, but you rated this track ${lastRated.rating}/5.`
                  : `You said you like ${lastRated.sourceGenre}, but you rated this track ${lastRated.rating}/5.`}
              </ThemedText>
            </ThemedView>
          )}

          <TouchableOpacity onPress={handleNext} activeOpacity={0.7}>
            <ThemedView style={styles.primaryButton} lightColor="#0a7ea4" darkColor="#0a7ea4">
              <ThemedText style={styles.primaryButtonText}>
                {currentIndex + 1 < queue.length ? 'Next Track →' : 'See Summary →'}
              </ThemedText>
            </ThemedView>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
    );
  }

  // screen === 'summary'
  const mismatches = ratings.filter(isMismatch);

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <ThemedView style={styles.container}>
        <ThemedText type="title">Results</ThemedText>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          {mismatches.length} of {ratings.length} tracks didn&apos;t match your stated taste
        </ThemedText>

        {mismatches.length > 0 ? (
          <ThemedView style={styles.summaryList}>
            {mismatches.map((t) => (
              <ThemedView key={t.id} style={styles.summaryRow}>
                <ThemedText type="defaultSemiBold">{t.trackName}</ThemedText>
                <ThemedText>
                  {t.artistName} · {t.primaryGenreName}
                </ThemedText>
                <ThemedText>
                  Pool: {t.pool} · Rated {t.rating}/5
                </ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        ) : (
          <ThemedText>Your ratings matched your stated taste every single time.</ThemedText>
        )}

        <TouchableOpacity onPress={handleRestart} activeOpacity={0.7}>
          <ThemedView style={styles.primaryButton} lightColor="#0a7ea4" darkColor="#0a7ea4">
            <ThemedText style={styles.primaryButtonText}>Start Over</ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    gap: 12,
    alignItems: 'stretch',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  chipTextDisabled: {
    opacity: 0.4,
  },
  errorText: {
    color: '#c0392b',
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  playerArea: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 32,
  },
  bigPlayButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPlayIcon: {
    fontSize: 48,
    color: '#fff',
  },
  timeText: {
    marginTop: 8,
    opacity: 0.7,
  },
  loadingText: {
    opacity: 0.6,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  ratingButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  ratingButtonText: {
    fontSize: 18,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 12,
    alignSelf: 'center',
  },
  mismatchBanner: {
    padding: 16,
    borderRadius: 12,
    gap: 4,
    marginTop: 8,
  },
  mismatchTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  summaryList: {
    gap: 16,
    marginTop: 8,
  },
  summaryRow: {
    gap: 2,
  },
});
