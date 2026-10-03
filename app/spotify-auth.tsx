import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Where Spotify's login lands back in the app. On iPhone the login sheet catches
 * it first, so this never shows; on Android the link also opens this route, so it
 * steps straight back to Rewind, which is already reading the code.
 */
export default function SpotifyAuthReturn() {
  const router = useRouter();
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
  return null;
}
