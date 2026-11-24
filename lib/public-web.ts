import { Platform } from 'react-native';

/**
 * The public website: a production web build, like the Dec 3 showcase link, which anyone with the link can open.
 * There, nothing a visitor types reaches other people (no comments, no new vibe words) and People only shows its
 * made-up example, so strangers can't join, wave or swap handles. Phones and a dev server on this computer are unchanged.
 */
export const PUBLIC_WEB = Platform.OS === 'web' && !__DEV__;
