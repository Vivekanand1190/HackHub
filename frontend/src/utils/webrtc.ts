/**
 * Shared ICE configuration for the in-app peer-to-peer media features
 * (the voice huddle and the screen share).
 *
 * Deliberately empty by default. With no STUN/TURN the browser only gathers
 * host candidates, which is all a localhost or same-LAN session needs - and it
 * means neither feature touches a third-party service.
 *
 * To also reach peers behind NAT on other networks, point NEXT_PUBLIC_TURN_URL
 * at a relay you run yourself (e.g. coturn). It stays a variable reference, so
 * the noExternalHosts audit in CI still passes.
 */
export const ICE_SERVERS: RTCIceServer[] = (() => {
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (!url) return [];
  const server: RTCIceServer = { urls: url };
  const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (username) server.username = username;
  if (credential) server.credential = credential;
  return [server];
})();

/**
 * The `webrtc-signal` relay is shared by every peer-to-peer feature, and the
 * huddle now stays mounted while the screen-share panel is open. Signals are
 * therefore tagged with the feature they belong to, so a screen-share offer
 * cannot be mistaken for a huddle offer (or the reverse).
 */
export type SignalScope = 'huddle' | 'screenshare';

/** Shape of the payload relayed under `webrtc-signal`. */
export interface RelaySignal {
  scope?: SignalScope;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface RelayPayload {
  signal?: RelaySignal;
  from?: string;
}
