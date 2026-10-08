/** The weekly "Called it" reminder. One fixed id, so rescheduling replaces rather than stacks. */
export const NUDGE = {
  id: 'blindspot-called-it-weekly',
  title: 'Your finds grew this week',
  body: 'See who you called 📈',
  url: '/modal',
  trigger: { weekday: 1, hour: 18, minute: 0 }, // expo weekly trigger: 1 = Sunday
} as const;

export type NudgeItem = { sentence: string };

/**
 * What the weekly reminder says: the top unseen news item beats a Taste Decoded finding,
 * which beats the Called it fallback text.
 */
export function nudgeContent(
  news?: NudgeItem | null,
  finding?: NudgeItem | null
): { title: string; body: string; url: string } {
  if (news) {
    return { title: NUDGE.title, body: news.sentence, url: NUDGE.url };
  }
  if (finding) {
    return { title: 'New finding about your taste', body: finding.sentence, url: '/decoded' };
  }
  return { title: NUDGE.title, body: NUDGE.body, url: NUDGE.url };
}
