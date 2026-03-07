/** Actor identifier. For productions with a defined cast this is a StoredActor.id (uuid).
 * Legacy productions use the string literals 'alpha' and 'beta'. */
export type ActorId = string;

export type ScriptLine = {
  actorId: ActorId;
  text: string;
  /** Seconds of silence to leave after this line finishes before the next one starts. */
  pauseAfter: number;
};

/** Fallback cast used when a production has no actors defined. */
export const SANDBOX_ACTORS: { id: ActorId; label: string }[] = [
  { id: 'alpha', label: 'Alpha' },
  { id: 'beta',  label: 'Beta'  },
];
