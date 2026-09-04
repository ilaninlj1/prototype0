export type GenreTaxonomy = Record<string, string[]>;

// Parent -> curated children. Approved grouping. Two parent labels here
// ("Latin", "World") aren't themselves curated genres — see the `genre: null`
// note on GenreSection below for why that matters.
export const GENRE_TAXONOMY: GenreTaxonomy = {
  Electronic: [
    'House',
    'Deep House',
    'Tech House',
    'Techno',
    'Dubstep',
    'Drum and Bass',
    'Disco',
    'Ambient',
    'Lo-Fi',
  ],
  Rock: ['Shoegaze', 'Punk', 'Metal', 'Grunge', 'Indie Rock'],
  'Hip-Hop': ['Drill', 'Boom Bap'],
  'R&B': ['Funk', 'Soul'],
  Latin: ['Reggaeton', 'Salsa', 'Bachata', 'Cumbia'],
  Pop: ['Bedroom Pop', 'K-Pop'],
  World: ['Afrobeats', 'Amapiano'],
  Jazz: ['Bossa Nova'],
};

const DISCOVERED_LABEL = 'Discovered';

export type GenreSection =
  | { type: 'leaf'; genre: string }
  | { type: 'group'; label: string; genre: string | null; children: string[] };

/**
 * Organizes the flat curated + discovered genre pools into sections for the
 * picker: taxonomy parents become expandable groups, curated genres with no
 * assigned parent (Country, Classical, Gospel, Reggae) stay flat leaves, and
 * any discovered genre the taxonomy doesn't cover (raw iTunes strings like
 * "Urbano latino" or "Punjabi Pop") lands in a synthetic "Discovered" group
 * at the end — never guessed at by substring matching, the same fragile
 * approach GENRE_TERM_OVERRIDES already moved away from elsewhere.
 *
 * A group's `genre` is its label only when that label is *itself* a literal
 * curated genre (Rock, Pop, Electronic, ... — already directly searchable
 * today). "Latin" and "World" are labels invented purely to organize this
 * taxonomy, not real curated genres, so they (like "Discovered") get
 * `genre: null` — chevron-only, not selectable — rather than silently
 * becoming new, unverified search terms.
 *
 * Sections and each group's children are sorted alphabetically for
 * scannability, matching the flat list's previous behavior; "Discovered" is
 * always last regardless, and omitted entirely when it would be empty.
 */
export function buildGenreSections(
  curatedGenres: string[],
  discoveredGenres: string[],
  taxonomy: GenreTaxonomy = GENRE_TAXONOMY
): GenreSection[] {
  const curatedSet = new Set(curatedGenres);
  const discoveredSet = new Set(discoveredGenres);

  const childToParent = new Map<string, string>();
  for (const [parent, children] of Object.entries(taxonomy)) {
    for (const child of children) childToParent.set(child, parent);
  }

  const known = new Set<string>(curatedGenres);
  for (const parent of Object.keys(taxonomy)) known.add(parent);
  for (const children of Object.values(taxonomy)) {
    for (const child of children) known.add(child);
  }

  const sections: GenreSection[] = [];
  const parentsRendered = new Set<string>();

  // A group only renders children actually present in the offered pool — a
  // taxonomy entry whose children never made it into curatedGenres shouldn't
  // produce an empty, pointless expandable row. If the parent label is itself
  // selectable but ends up with nothing under it, it demotes to a plain leaf
  // instead of vanishing; if it's not selectable (Latin, World) and empty, the
  // whole thing is skipped.
  function renderParent(label: string) {
    if (parentsRendered.has(label)) return;
    parentsRendered.add(label);
    const availableChildren = taxonomy[label]
      .filter((child) => curatedSet.has(child) || discoveredSet.has(child))
      .sort();
    const selectable = curatedSet.has(label);
    if (availableChildren.length === 0) {
      if (selectable) sections.push({ type: 'leaf', genre: label });
      return;
    }
    sections.push({ type: 'group', label, genre: selectable ? label : null, children: availableChildren });
  }

  for (const genre of curatedGenres) {
    if (childToParent.has(genre)) continue; // rendered under its parent instead
    if (taxonomy[genre]) {
      renderParent(genre);
      continue;
    }
    sections.push({ type: 'leaf', genre });
  }

  // Taxonomy parents that aren't themselves curated genres (Latin, World)
  // never get visited by the loop above — make sure their groups still exist.
  for (const parent of Object.keys(taxonomy)) {
    renderParent(parent);
  }

  sections.sort((a, b) => {
    const labelOf = (s: GenreSection) => (s.type === 'leaf' ? s.genre : s.label);
    return labelOf(a).localeCompare(labelOf(b));
  });

  const discoveredLeftovers = discoveredGenres.filter((g) => !known.has(g)).sort();
  if (discoveredLeftovers.length > 0) {
    sections.push({ type: 'group', label: DISCOVERED_LABEL, genre: null, children: discoveredLeftovers });
  }

  return sections;
}
