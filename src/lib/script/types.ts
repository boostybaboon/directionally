/** Actor identifier. For productions with a defined cast this is a StoredActor.id (uuid).
 * Legacy productions use the string literals 'alpha' and 'beta'. */
export type ActorId = string;

/** A dialogue beat authored by a specific actor. */
export type DialogueLine = {
  actorId: ActorId;
  text: string;
  /**
   * Optional speech direction (parenthetical) displayed between the character name and the
   * dialogue in the rendered script, e.g. "stepping from the shadows" or "whispering".
   * Do not include the surrounding parentheses — the rendering layer adds them.
   */
  parenthetical?: string;
  /** Seconds of silence to leave after this line finishes before the next one starts. */
  pauseAfter: number;
  /** Explicit start time in seconds. When absent, the line is auto-sequenced after the previous one. */
  startTime?: number;
};

/** A stage direction / action description line (non-dialogue). */
export type DirectionLine = {
  type: 'direction';
  text: string;
};

/**
 * A single entry in a scene's full script sequence.
 * Dialogue lines (absent `type`) and direction lines (`type: 'direction'`) can be interleaved.
 * All existing `ScriptLine` data without a `type` field is treated as a `DialogueLine`.
 */
export type ScriptLine = DialogueLine | DirectionLine;

export function isDialogueLine(line: ScriptLine): line is DialogueLine {
  return (line as DirectionLine).type !== 'direction';
}

export function isDirectionLine(line: ScriptLine): line is DirectionLine {
  return (line as DirectionLine).type === 'direction';
}

