// Tune's test buttons: bring up any animal without waiting for it.

export type SeaLifeTest = 'fly' | 'bait' | 'seal' | 'pod' | 'leap' | 'hump' | 'breach' | 'sperm' | 'blue';

export const SEA_LIFE_TESTS: { key: SeaLifeTest; label: string }[] = [
  { key: 'fly', label: 'Flying fish' },
  { key: 'bait', label: 'Small fish' },
  { key: 'seal', label: 'Seal' },
  { key: 'pod', label: 'Dolphins' },
  { key: 'leap', label: 'Dolphins leaping' },
  { key: 'hump', label: 'Humpback' },
  { key: 'breach', label: 'Breach' },
  { key: 'sperm', label: 'Sperm whale' },
  { key: 'blue', label: 'Blue whale' },
];
