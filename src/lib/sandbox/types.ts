export type ActorId = 'alpha' | 'beta';

export type ScriptLine = {
  actorId: ActorId;
  text: string;
  /** Seconds of silence to leave after this line finishes before the next one starts. */
  pauseAfter: number;
};

export const SANDBOX_ACTORS: { id: ActorId; label: string }[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta',  label: 'Beta'  },
];
