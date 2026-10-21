import { Redirect } from 'expo-router';

// The Liked list became the Library tab (Minimal UI, 2026-10-21); old links and the weekly nudge still land there.
export default function LikedTracksRedirect() {
  return <Redirect href="/library" />;
}
