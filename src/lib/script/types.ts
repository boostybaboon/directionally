/** Actor identifier. For productions with a defined cast this is a StoredActor.id (uuid).
 * Legacy productions use the string literals 'alpha' and 'beta'. */
export type ActorId = string;

export type ScriptLine = {
  actorId: ActorId;
  text: string;
  /** Seconds of silence to leave after this line finishes before the next one starts. */
  pauseAfter: number;
  /** Explicit start time in seconds. When absent, the line is auto-sequenced after the previous one. */
  startTime?: number;
};

