import type { Strategy } from '@/lib/discovery';
import type { MapPoint } from '@/lib/sound-map';

// The Liked list and the Dark Map ask Home to steer; Home takes it the next time it's focused.
export type SteerRequest = { kind: 'artist' | 'sound'; strategy: Strategy } | { kind: 'map'; point: MapPoint; words: string };

let pending: SteerRequest | null = null;

export function requestSteer(request: SteerRequest) {
  pending = request;
}

export function takeSteerRequest(): SteerRequest | null {
  const request = pending;
  pending = null;
  return request;
}
