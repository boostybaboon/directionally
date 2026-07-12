# Treatment — "Homecoming" (dialogue-driven)

A test production for exercising the writer-first authoring path. This document is a plain
prose treatment — it deliberately avoids any reference to the app's internal data model,
scripting DSL, blocks, or staging mechanics. The goal is to keep re-reading this and asking
"how hard would this be to actually build in the app today?" as the tool evolves.

Movement and staging in this piece exist **only to support the dialogue** — they should be
addable after the lines are written, and the scene should already "work" emotionally with the
characters standing still and just speaking.

---

## Premise

Two former bandmates, **Jo** and **Cass**, haven't spoken in ten years since their band broke
up mid-tour. Jo has asked Cass to meet at Jo's flat to discuss a reunion show. Over the course
of one evening, small talk gives way to the unresolved argument that actually ended the band —
whether Cass leaving for a solo deal was a betrayal or the only reasonable choice. It ends
without a clean resolution: they agree to think about the reunion, but something has shifted
between them.

Two characters. Three scenes. One location across all three (Jo's flat), at different points
in the same evening, so lighting/mood can shift scene to scene even though the set does not.

---

## Cast

- **Jo** — stayed in music semi-professionally, teaches guitar now, guarded but wants this to
  work. Speaks less than Cass; a lot of the tension is in what Jo *doesn't* say.
- **Cass** — became successful solo, confident, talks fast when nervous, over-explains. Came
  tonight because they miss Jo more than they'll admit.

---

## Scene 1 — "Small Talk" (evening, just after Cass arrives)

Jo has let Cass in. Neither has said the real reason for the meeting yet. This scene is almost
entirely social scaffolding — the words are mundane but every line has a second meaning
underneath.

Sample lines (order matters, pacing matters — pauses are part of the point):

1. **Cass:** "You kept the piano. I wasn't sure you would."
2. **Jo:** "Didn't have anywhere else to put it."
3. **Cass:** "Place looks good. Smaller than I remember."
4. **Jo:** *(a beat)* "Everything's smaller than you remember, once you leave it long enough."
5. **Cass:** "Fair."
6. **Cass:** "So. The reunion thing. Marcus really thinks the old venue would take us back?"
7. **Jo:** "He thinks a lot of things. Doesn't mean he's wrong."

**Movement, added secondarily, to support the above:** Cass should enter and drift toward the
piano on line 1 — a physical pull toward the shared past — while Jo stays near the door,
keeping distance. By line 6, when the conversation turns to business, both should end up
sitting, putting furniture between them rather than beside each other. None of this needs to
exist for the scene to be legible; it should read as "two people talking" even completely
static, and staging should only sharpen what's already true in the words.

---

## Scene 2 — "The Argument" (later the same evening, after a drink or two)

The real subject surfaces. Cass tries to keep it business; Jo won't let the old wound stay
buried.

Sample lines:

1. **Jo:** "You never actually said sorry, you know. Ten years, and not once."
2. **Cass:** "Sorry for what, Jo? For having a career?"
3. **Jo:** "For leaving three days before a tour finale and telling the label before you told
   us."
4. **Cass:** "I told you the day I decided —"
5. **Jo:** "You told me the day your lawyer said you had to."
6. **Cass:** *(quieter)* "That's not — okay. Maybe that's fair."
7. **Jo:** "I'm not trying to win an argument from a decade ago."
8. **Jo:** "I just need to know if this reunion is you actually wanting to come back, or
   another thing you're doing because someone told you to."
9. **Cass:** "...I don't know yet. Is that allowed?"

**Movement, added secondarily:** This is the emotional peak, so proximity should tighten and
then break. Suggest: Cass stands up mid-argument (line 4, interrupted), which puts them face
to face with Jo for the accusation in lines 5–7; then on line 9, Cass turns away rather than
maintaining eye contact — the physical admission of doubt before the verbal one. Again: the
scene must work with both actors rooted in place. Movement is punctuation, not plot.

---

## Scene 3 — "What's Left" (later still — could be same night, winding down, or a implied
timeskip to Cass leaving)

No resolution, but no rupture either. Something between the two of them has shifted from
"unspoken grievance" to "acknowledged and unresolved," which is its own kind of progress.

Sample lines:

1. **Cass:** "I should probably go."
2. **Jo:** "Probably."
3. **Cass:** "For what it's worth — I am sorry. Ten years late."
4. **Jo:** "...Yeah. Well. You're here now."
5. **Cass:** "Is that a yes to the reunion?"
6. **Jo:** "It's a 'call me next week.'"
7. **Cass:** *(small laugh)* "That's the most yes I've heard from you all night."

**Movement, added secondarily:** Cass should physically move toward the exit on line 1 and
then hesitate — a beat where they almost leave without saying the line-3 apology. Jo could
rise to see them out, closing the distance from Scene 1 slightly, without erasing it entirely.
The scene should end with both characters closer than they started the evening, but not
touching, not resolved — visually encoding "progress without closure."

---

## Why this production is a good workflow test

- Tests whether writing dialogue alone produces a legible, playable scene with no staging
  effort at all (the writer-first promise).
- Tests whether staging/movement can be added **after** the fact, attached to specific lines,
  without needing to touch anything already written.
- Tests pacing and pause authoring — several lines depend on a beat/pause before or after for
  the meaning to land; the tool needs to make "wait half a second before this line" easy.
- Only two characters and one location — isolates dialogue/pacing/staging concerns from set
  dressing or camera complexity.
- Three scenes sharing one location, different times of evening — tests whether lighting/mood
  changes can be authored per-scene without rebuilding the set.
