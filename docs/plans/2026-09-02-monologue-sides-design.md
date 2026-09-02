# Monologue search: audition sides + a switch that replaces instead of rebuilding

2026-09-02

## Why

Two complaints, one of them structural.

**The tab switch rebuilds the page.** Everything above the results reads
`hasSearched`, which is the *Plays* flag. Film & TV keeps its own
`filmTvHasSearched`. Tapping Film & TV with Plays results on screen flips
`hasSearched` to false and six things move at once:

| | Plays, searched | after one tap |
|---|---|---|
| container | `max-w-3xl` | `max-w-[88rem]` |
| search bar | sticky, compact | unsticks, grows |
| hero title | gone | animates back in |
| tabs | quiet text | boxed segmented control |
| filters row | hidden | reappears |
| results | plays list | film list, no transition |

That reads as changing rooms rather than changing shelves.

**The row lost signal along with the noise.** `MonologueSpeech` replaced
`MonologueResultCard` and dropped the rank label *and* the profile reason
("why you got this") together with the three competing badge systems. Only the
badge that said "Great match" on nearly every row deserved to go. The other two
say something an actor cannot read off the page. `computeMatchReasons` is still
imported in `app/(platform)/monologues/page.tsx` and no longer called.

## The margin

Every row gets a fixed left column, ~5rem, right-aligned, usually empty.
Annotations sit there as pencil notes, lowercase and small, aligned to the
baseline of the line they annotate.

```
            AMANDA                    1:40 · 30s · defiant
            The Glass Menagerie, Williams

 best pick  "I've had to put up a solitary battle all these
 your lane   years. But you're my right-hand bower!..."
                                             read it all
            Rehearse · Save
```

The column is reserved whether or not it holds anything, so an annotation
appearing never moves the speech. That is the whole point: the previous row had
nowhere to put a mark, which is why every mark was deleted. Annotations stack
rather than compete for the same inline space.

Below `sm` the column collapses and the marks run as one small line above the
character name.

### Vocabulary, in priority order

| mark | condition | colour |
|---|---|---|
| `exact quote` / `name match` / `play match` | `match_type` says the result is not a vector hit | muted |
| `best pick` | index 0, and no stronger match_type | mode accent |
| `your lane` | first `category: "profile"` reason from `computeMatchReasons` | teal |
| `everyone brings this` | `overdone_score > 0.7` | amber |

`best pick` takes the mode accent — orange on Plays, violet on Film & TV — so
the tint says which shelf you are on without a label. Teal already means
Collection elsewhere in the app. Everything else stays muted. Sparse on purpose:
most rows show nothing, which is what makes a mark worth reading.

## The switch

1. Compact chrome reads `hasSearched || filmTvHasSearched`. Nothing above the
   results moves on a tab tap. This alone removes all six jumps.
2. The tab indicator becomes one `layoutId` pill that slides between the two.
3. Tapping a tab carries the current query across and runs it in the new mode,
   so there is no empty shelf. One API call per tap, only when the query is
   non-empty and the other mode is not already showing that query's results.
4. The Film & TV success branch is a bare `<div>` today, so it pops in while
   Plays fades out. Both branches become keyed `motion.div`s and cross-fade.
5. `rgb(167,139,250)` is hardcoded in six places. It becomes `--accent-screen`
   with a light/dark pair, and transitions rather than snapping. Hardcoded hex
   silently opts an element out of dark mode — the same trap as the 67
   hardcoded `#CB4B00`.

## Not doing

Film & TV poster thumbnails were lost in the book conversion. They come back, in
the margin, where they cost no vertical space.
