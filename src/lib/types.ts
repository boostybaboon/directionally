export type VoiceMode = 'espeak' | 'web-speech' | 'kokoro';
export type VoiceBackend = 'idle' | 'loading' | 'espeak' | 'kokoro' | 'browser';

export type SelectedEntity =
  | { kind: 'actor-initial'; actorId: string }
  | { kind: 'actor-block'; actorId: string; blockIndex: number }
  | { kind: 'setpiece-initial'; setPieceId: string }
  | { kind: 'setpiece-block'; setPieceId: string; blockIndex: number }
  | { kind: 'light-initial'; lightId: string }
  | { kind: 'light-block'; lightId: string; blockIndex: number }
  | { kind: 'camera-initial' }
  | { kind: 'camera-block'; blockIndex: number }
  | null;
