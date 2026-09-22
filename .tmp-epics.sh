#!/bin/bash
cd /home/boost/dev/directionally

mk() { gh issue create --title "$1" --label "epic" --body-file <(printf '%s\n' "$2") 2>/dev/null | tail -1; }

link() {
  local parent_num="$1"; shift
  local pid; pid=$(gh issue view "$parent_num" --json id --jq .id)
  for child in "$@"; do
    local cid; cid=$(gh issue view "$child" --json id --jq .id)
    gh api graphql -f query="mutation { addSubIssue(input: {issueId: \"$pid\", subIssueId: \"$cid\"}) { issue { number } } }" >/dev/null 2>&1 && echo "$parent_num <- $child OK" || echo "$parent_num <- $child FAILED"
  done
}

gh label create epic --color '1d76db' --description 'A coherent feature grouping sub-issues' --force >/dev/null 2>&1

E1=$(mk 'Dressing: varying a set to a scene' 'A venue is a Definition; dressing is how one scene varies it (resize, recolour, swap a piece). The pieces exist; the surfaces do not: no script syntax, no panel, and the agent cannot reach it.

Done when a writer or the AI can adjust a set for one scene without opening the sketcher.' | sed 's#.*/##')
E2=$(mk 'Getting a production out of the app' 'Watch it is not the same as keep it. Today a production can be played and screen-captured, and nothing more.

Done when a finished scene leaves the app as a file someone else can watch, and the script leaves as clean prose.' | sed 's#.*/##')
E3=$(mk 'AI: from demo to something usable' 'The loop works end to end now; what stands between it and real use is cost, keys, validation and the parts of a scene it cannot yet touch.

Done when someone other than the author can point it at a script without the author paying or babysitting it.' | sed 's#.*/##')
E4=$(mk 'Authoring ergonomics' 'Writing and arranging: what the editor tells you while you type, and whether an edit keeps the identity of what it did not touch.

Done when a set can be renamed, reordered and completed without surprising the person doing it.' | sed 's#.*/##')
E5=$(mk 'Debt: decide or delete' 'Things built and unreachable, or documents that disagree. None is urgent; each is a decision that costs more the longer it waits, because a reader cannot tell a deliberate omission from an oversight.

Done when each is either wired up or removed.' | sed 's#.*/##')
E6=$(mk 'Catalogue depth' 'The library beyond the bundled entries: where assets come from, and how much is there to start from.' | sed 's#.*/##')
E7=$(mk 'Sound and the light rig' 'The two capability tracks that a finished production needs: a rig worth lighting with, and a timeline worth scoring to.' | sed 's#.*/##')
E8=$(mk 'Humanoid: the remaining body work' 'Rows 9-12 of the humanoid status table: the body beyond the ring graph, and the AI surface re-pointed at the parameters the app actually uses.' | sed 's#.*/##')
E9=$(mk 'Workflow walkthroughs' 'Five documented walks through the app, each doing a job a person would actually do. Documentation, but it is the documentation that says whether the app is usable.' | sed 's#.*/##')

echo "epics: $E1 $E2 $E3 $E4 $E5 $E6 $E7 $E8 $E9"
link "$E1" 10 12 13 14
link "$E2" 25 27
link "$E3" 28 29 30 31 49
link "$E4" 7 11 45
link "$E5" 2 3 40 42 46 47 19
link "$E6" 24 26
link "$E7" 22 23
link "$E8" 32 33 34
link "$E9" 35 36 37 38 39
echo DONE
