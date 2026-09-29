// Attribution the data sources' terms require: Apple wants a link to the
// song next to every preview and "provided courtesy of iTunes"; Last.fm
// wants credit and links to its catalogue pages wherever its data shows.

export const CREDIT_LINE = 'Previews provided courtesy of iTunes · Listener data from Last.fm';

export function appleMusicUrl(trackId: number, trackViewUrl?: string): string {
  return trackViewUrl || `https://music.apple.com/us/song/${trackId}`;
}

export function lastfmArtistUrl(artist: string): string {
  return `https://www.last.fm/music/${encodeURIComponent(artist).replace(/%20/g, '+')}`;
}
