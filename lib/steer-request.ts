import type { Strategy } from '@/lib/discovery';

// The Liked list asks Home to steer; Home takes it the next time it's focused.
export type SteerRequest = { kind: 'artist' | 'sound'; strategy: Strategy };

let pending: SteerRequest | null = null;

export function requestSteer(request: SteerRequest) {
  pending = request;
}

export function takeSteerRequest(): SteerRequest | null {
  const request = pending;
  pending = null;
  return request;
}
