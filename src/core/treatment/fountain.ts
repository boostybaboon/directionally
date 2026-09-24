/**
 * Script types, Fountain renderer, and canonical example.
 *
 * ScriptDocument is the source of truth — fully typed, no regex parsing
 * of free text anywhere. Fountain text is derived from ScriptDocument via
 * renderFountain(), never the reverse.
 *
 * See ROADMAP.md "Data Contract" for the layer model.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type Diagnostic = {
  line: number;
  level: 'error' | 'warning' | 'info';
  message: string;
  /** Structured hint for actionable diagnostics (Track CAT, CAT-4 "Create →"). */
  kind?: 'unresolved-cast' | 'unresolved-setting' | 'ambiguous-cast' | 'ambiguous-setting';
  /** The typed name this diagnostic refers to. */
  name?: string;
};

export type ActionVerb = 'enter' | 'exit' | 'move' | 'hold';
export type StageSide = 'left' | 'right';
export type StageMark = 'left' | 'center' | 'right';

export type ActionBeat = {
  type: 'action';
  character: string;
  verb: ActionVerb;
  /** Side for enter/exit. Omitted = actor's default side. */
  side?: StageSide;
  /** Target mark for move. Required for move verb. */
  target?: StageMark;
  /** Duration in seconds for hold. Required for hold verb. */
  seconds?: number;
};

export type DressingOp = 'hide' | 'show' | 'remove' | 'move';

/**
 * A scene's venue, with these modifications — the `##` line, read as a subheading of the
 * heading above it. It carries no time: a dressing is how the scene stands, not an event in
 * it, so the compiler gives it no duration (`LightBlock` is the timed one).
 */
export type DressingBeat = {
  type: 'dressing';
  op: DressingOp;
  /** Node path inside the setting's document — `seat`, or `chair-legs/left`. */
  node: string;
  /** Where the node stands in this scene. `move` only. */
  position?: [number, number, number];
};

export type Beat =
  | { type: 'dialogue'; character: string; text: string; parenthetical?: string }
  | ActionBeat
  | DressingBeat
  | { type: 'transition'; text: string };

export type SceneBlock = {
  heading: string;
  /** true = Interior (INT.), false = Exterior (EXT.) */
  interior?: boolean;
  /** Setting name, e.g. "STAGE", "JO'S FLAT" */
  setting?: string;
  /** Time of day, e.g. "DAY", "NIGHT" */
  timeOfDay?: string;
  beats: Beat[];
};

export type ScriptDocument = {
  title?: string;
  scenes: SceneBlock[];
  /** Normalised cast names (CAST CASE), in order of first appearance. */
  cast: string[];
  diagnostics: Diagnostic[];
};

// ── Canonical example ───────────────────────────────────────────────────────

export function createDefaultScriptDocument(): ScriptDocument {
  return {
    scenes: [
      {
        heading: 'INT. STAGE - DAY',
        interior: true,
        setting: 'STAGE',
        timeOfDay: 'DAY',
        beats: [
          { type: 'action', character: 'ALPHA', verb: 'enter', side: 'left' },
          { type: 'action', character: 'BETA',  verb: 'enter', side: 'right' },
          { type: 'dialogue', character: 'ALPHA', text: 'We start here.' },
          { type: 'action', character: 'ALPHA', verb: 'move', target: 'center' },
          { type: 'dialogue', character: 'BETA', text: 'Copy that.' },
        ],
      },
    ],
    cast: ['ALPHA', 'BETA'],
    diagnostics: [],
  };
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function renderActionBeat(beat: ActionBeat): string {
  const c = beat.character;
  switch (beat.verb) {
    case 'enter': {
      const side = beat.side ? ` stage ${beat.side}` : '';
      return `${c} enters from${side}.`;
    }
    case 'exit': {
      const side = beat.side ? ` to stage ${beat.side}` : '';
      return `${c} exits${side}.`;
    }
    case 'move': {
      const target = beat.target ?? 'center';
      return `${c} moves to ${target}.`;
    }
    case 'hold':
      return `${c} holds ${beat.seconds ?? 1.0}.`;
  }
}

/**
 * Render a ScriptDocument to valid, readable Fountain text.
 * Always valid because it flows from a known-good data structure.
 */
export function renderFountain(doc: ScriptDocument): string {
  const parts: string[] = [];

  if (doc.title) {
    parts.push(`Title:\n    ${doc.title}\n`);
  }

  for (const scene of doc.scenes) {
    const interior = scene.interior;
    const setting = scene.setting;
    const tod = scene.timeOfDay;
    if (interior == null && !setting && !tod) {
      parts.push('UNTITLED');
    } else {
      const prefix = interior == null ? 'INT./EXT.' : (interior ? 'INT.' : 'EXT.');
      parts.push(`${prefix} ${setting || 'UNTITLED'} - ${tod || 'DAY'}`);
    }
    parts.push('');

    for (const beat of scene.beats) {
      switch (beat.type) {
        case 'dialogue':
          parts.push(beat.character);
          if (beat.parenthetical) parts.push(`(${beat.parenthetical})`);
          parts.push(beat.text);
          parts.push('');
          break;
        case 'action':
          parts.push(renderActionBeat(beat));
          parts.push('');
          break;
        case 'dressing':
          // Production direction, not screenplay text: the dressing lives in the script
          // document and reaches the set through the compiler, so the page stays a screenplay.
          break;
        case 'transition':
          parts.push(beat.text);
          parts.push('');
          break;
      }
    }
  }

  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n');
}
