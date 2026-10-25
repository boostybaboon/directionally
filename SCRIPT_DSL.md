# Script DSL — writing a play for Directionally

A screenplay-like format. You write scenes in plain text; the app compiles them into a playable 3D
scene — a venue, characters who enter, speak and move, and a camera watching them. No cast list, no
scene numbers, no formatting.

Every line is either a **sigil line** (it starts with `#`, `##`, `>` or `@`) or a **dialogue line**
(it follows an `@` cue). Blank lines are ignored and are there for readability only.

## The four sigils

| sigil | example | what it is |
|---|---|---|
| `#` | `#INT KITCHEN DAY` | a new scene: interior/exterior, place, time |
| `>` | `>ALICE enters left` | an action beat for one character |
| `@` | `@ALICE` | a speaker cue — the lines beneath are her dialogue |
| `##` | `## hide sofa` | a change to the place itself, for this scene only |

## Scene heading

`#INT PLACE TIME` or `#EXT PLACE TIME`

- `INT` or `EXT` — interior or exterior. Required.
- `PLACE` — one or more words: `KITCHEN`, `JO'S FLAT`, `STREET CORNER`.
- `TIME` — one word: `DAY`, `NIGHT`, `MORNING`, `AFTERNOON`, `EVENING`, `DAWN`, `DUSK`, `CONTINUOUS`.

Use the same `PLACE` for the same location every time. That is how one venue recurs across scenes,
with the same furniture standing in it.

## Action beats

`>NAME verb [argument]`

| verb | argument | effect |
|---|---|---|
| `enters` | `left` / `right` (optional) | walks on from that side |
| `exits` | `left` / `right` (optional) | walks off to that side |
| `moves` | `left` / `center` / `right` (optional) | walks to that mark |
| `holds` | seconds, e.g. `2` (optional) | stands still for that long |

Names are upper case. An argument may be left off; the app picks a sensible default.

The rule that matters most: **if a character's first beat in a scene is `enters`, they start off stage
and walk on.** Otherwise they are already standing there when the scene begins.

## Dialogue

```
@ALICE
Where is everybody?
```

Everything after `@NAME` is that character's speech until the next sigil — further lines, blank lines
between them, all of it. Her dialogue ends when a new `@` or any other sigil begins.

## Dressing

`## hide NODE` · `## show NODE` · `## remove NODE` · `## move NODE x y z`

- `NODE` is one part of the place, lower case, `/` for nested parts: `sofa`, `counter/drawer`.
- `hide` / `show` — invisible / visible in this scene. `remove` — gone from this scene. `move` — placed
  at x y z, in metres.
- Dressing is **static for the scene**. It says how the place stands, not something that happens
  part-way through.
- Only parts that already exist in the place can be dressed. If you do not know them, leave `##` out.

## What the app does with your script

- Each scene plays in the place you named. A place with no venue behind it becomes a plain room.
- Characters stand left and right; `moves` takes them to a mark. **Blocking is coarse**: two sides and
  three marks along one line across the front of the scene. No depth, no doors, no sitting, no stairs,
  no touching anything.
- Speech is read aloud at roughly 2.5 words a second, and a scene runs for its content plus a beat —
  never less than six seconds.
- Names are matched to the catalogue afterwards. An unknown name becomes a generic figure, and a person
  can bind it to a real model in the Roster.

## Write like this

1. One place and one time per scene; the scene ends where the next `#` begins.
2. Reuse place names for recurring locations.
3. Block only with `enters`, `exits`, `moves`, `holds`. A `moves` is your "crosses the room".
4. Don't put two characters on the same mark within a beat.
5. One verb per action line.
6. No free-text action lines: a line that is neither a sigil nor under an `@` is ignored.
7. No parentheticals, scene numbers, transitions, title page, camera, lighting or sound cues. If one of
   those matters, say it in a note to your collaborator, not in the script.


## Example — a two-hander

```script
#INT KITCHEN NIGHT

## hide basket

>ALICE enters left
>BOB enters right

@ALICE
You said you'd call.

@BOB
I did call.

>BOB moves left

@BOB
You didn't answer.
```

## Example — two scenes, one venue

```script
#INT JO'S FLAT DAY

>ALICE enters left

@ALICE
Home.

#INT JO'S FLAT NIGHT

>ALICE moves center
>ALICE holds 3

@ALICE
Still home.
```

## Anti-example — what breaks

```script-bad
INT. KITCHEN - DAY

Alice enters from the left and looks around.

ALICE
Hello?
```

Four things are wrong, and together they produce no scene at all:

- The heading has no `#`, so no scene starts — everything after it is ignored.
- `Alice enters from the left and looks around.` is prose. There are no prose action lines; the beat
  would be `>ALICE enters left`.
- `ALICE` on its own is not a cue. A cue is `@ALICE`.
- `Hello?` has no speaker, so it is ignored too.

The app reports "no scenes" and there is nothing to play.

## Before you hand it back

- Every scene begins with `#INT` or `#EXT`.
- Every speech line sits under an `@NAME`.
- Every action begins with `>` and one of the four verbs.
- Place names are reused, not reinvented.
- Nothing that you meant as a direction is sitting in prose.

---

*This document describes the format the app currently accepts. If a rule here ever disagrees with the
app, the app is right and this file is wrong — say so and it gets fixed.*

