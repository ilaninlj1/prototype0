/** The weekly "Called it" reminder. One fixed id, so rescheduling replaces rather than stacks. */
export const NUDGE = {
  id: 'blindspot-called-it-weekly',
  title: 'Your finds grew this week',
  body: 'See who you called 📈',
  url: '/modal',
  trigger: { weekday: 1, hour: 18, minute: 0 }, // expo weekly trigger: 1 = Sunday
} as const;
