// One Home status at a time, with failures and ready editions first.

export type StatusItem =
  | { kind: 'failed' }
  | { kind: 'edition'; n: number }
  | { kind: 'news'; count: number }
  | { kind: 'map'; words: string }
  | { kind: 'more'; label: string }
  | { kind: 'sorted'; text: string };

export type StatusInputs = {
  failedOffline: boolean;
  editionReady: number | null;
  newsCount: number;
  mapWords: string | null;
  moreLabel: string | null;
  sortedText: string | null;
};

export function pickStatus(i: StatusInputs): StatusItem | null {
  if (i.failedOffline) return { kind: 'failed' };
  if (i.editionReady !== null) return { kind: 'edition', n: i.editionReady };
  if (i.newsCount > 0) return { kind: 'news', count: i.newsCount };
  if (i.mapWords) return { kind: 'map', words: i.mapWords };
  if (i.moreLabel) return { kind: 'more', label: i.moreLabel };
  if (i.sortedText) return { kind: 'sorted', text: i.sortedText };
  return null;
}

export function statusText(item: StatusItem): string {
  switch (item.kind) {
    case 'failed': return "Couldn't load more songs · Try again";
    case 'edition': return `Edition No. ${item.n} is ready · Play`;
    case 'news': return `While you were gone: ${item.count} ${item.count === 1 ? 'update' : 'updates'}`;
    case 'map': return `In the dark · ${item.words} ✕`;
    case 'more': return `More like this: ${item.label}`;
    case 'sorted': return `Sorted: ${item.text}`;
  }
}
