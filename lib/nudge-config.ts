/** The weekly "Called it" reminder. One fixed id, so rescheduling replaces rather than stacks. */
export const NUDGE = {
  id: 'blindspot-called-it-weekly',
  title: 'Your finds grew this week',
  body: 'See who you called 📈',
  url: '/modal',
  trigger: { weekday: 1, hour: 18, minute: 0 }, // expo weekly trigger: 1 = Sunday
} as const;

/** What the weekly reminder says: a Taste Decoded finding they haven't opened beats the Called it text. */
export function nudgeContent(unseen: { sentence: string } | null): { title: string; body: string; url: string } {
  return unseen
    ? { title: 'New finding about your taste', body: unseen.sentence, url: '/decoded' }
    : { title: NUDGE.title, body: NUDGE.body, url: NUDGE.url };
}
