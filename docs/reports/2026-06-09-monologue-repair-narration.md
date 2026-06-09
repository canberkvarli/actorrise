# Monologue Repair — APPLIED

Pipeline: strip → AI extract → gate. Fix applied only if it passes the quality gate; unsalvageable rows flagged `review_status=pending`.

AI model: `gpt-4o`

## source_type = `play`  (total 6683)

- clean (untouched): **6683** (100.0%)
- fixed_by_strip: **0**
- fixed_by_ai: **0**
- needs_review: **0**

### Sample AI repairs (before → after)

<details><summary>needs_review — 0 ids</summary>



</details>

## source_type = `film`  (total 1233)

- clean (untouched): **978** (79.3%)
- fixed_by_strip: **0**
- fixed_by_ai: **201**
- needs_review: **54**

### Sample AI repairs (before → after)

**#10878 — Max / Pi**
- before: The number is nothing. You know that! It's just a number. I'm sure you've written down every two hundred sixteen number. You've translated all of them. You've intoned them all. Haven't you? But what's it gotten you? It's not the number! It's the meaning. It's the syntax. It's wha…
- after:  The number is nothing. You know that! It's just a number. I'm sure you've written down every two hundred sixteen number. You've translated all of them. You've intoned them all. Haven't you? But what's it gotten you? It's not the number! It's the meaning. It's the syntax. It's wha…

**#10572 — Knight / The Seventh Seal**
- before: We were newly married and we played together. We laughed a great deal. I wrote songs to her eyes, to her nose, to her beautiful little ears. We went hunting together and at night we danced. The house was full of life. Faith is a torment, did you know that? It is like loving someo…
- after:  We were newly married and we played together. We laughed a great deal. I wrote songs to her eyes, to her nose, to her beautiful little ears. We went hunting together and at night we danced. The house was full of life. Faith is a torment, did you know that? It is like loving someo…

**#10697 — Sachem / The Last of the Mohicans**
- before: The white man comes like a day that has passed. And night enters our future with him. Our council talks since I was a boy: What is the Huron to do? But Magua would lead Huron down paths that make us not Hurons. Dark girl burn in fire to heal the twisted heart of Magua. Cora, hear…
- after:  The white man comes like a day that has passed. And night enters our future with him. Our council talks since I was a boy: What is the Huron to do? But Magua would lead Huron down paths that make us not Hurons. Dark girl burn in fire to heal the twisted heart of Magua. Munro daug…

**#11237 — Jerry / Fright Night**
- before: Do you? Really? When did you take your last confession? That's a mighty big cross you have there. Question is -- do you actually know how to use it? But Jerry's on him -- hands burning as he rips the cross from Charlie and shatters it with his hand. Then he tosses Charlie, who fl…
- after:  Do you? Really? When did you take your last confession? That's a mighty big cross you have there. Question is -- do you actually know how to use it? Ever take one of these in the chest? I have. But they missed the heart. Rigggght... here. Easy measurement. Shouldn't have been so …

**#10778 — Nick / Law Abiding Citizen**
- before: Been thinking. If I'd done things differently -- made different decisions from the start -- we wouldn't have gotten to this point. Here we are. Your decisions put us here too. This mess is on both of us. We can't change decisions we've made. We can only account for decisions we m…
- after:  Been thinking. If I'd done things differently -- made different decisions from the start -- we wouldn't have gotten to this point. Here we are. Your decisions put us here too. This mess is on both of us. We can't change decisions we've made. We can only account for decisions we m…

**#10568 — Sylvia / The Truman Show**
- before: You remember when you were a little boy, you stood up in class and said you wanted to be an explorer like Magellan. And your teacher, Sister Olivia said, "You're too late, Truman. There's nothing left to explore." And all the other kids laughed. And you sat down. It doesn't matte…
- after:  You remember when you were a little boy, you stood up in class and said you wanted to be an explorer like Magellan. And your teacher, Sister Olivia said, "You're too late, Truman. There's nothing left to explore." And all the other kids laughed. And you sat down. It doesn't matte…

**#12417 — DONALD / The Apprentice**
- before: Tonight, we’re here to celebrate a really great guy: Roy Cohn. Roy is tough. Some say vicious. Even scary! I mean, that’s not a face you want to bring home to your mother. Donald laughs at his dumb joke. People chuckle politely. I learned a lot from Roy. He once told me that he’s…
- after:  Tonight, we’re here to celebrate a really great guy: Roy Cohn. Roy is tough. Some say vicious. Even scary! I mean, that’s not a face you want to bring home to your mother. I learned a lot from Roy. He once told me that he’s spent more than two thirds of his adult life under indic…

**#10745 — Butch / A Perfect World**
- before: Alaska, Phillip. Wild and wooley. Man against nature. Me personally, I like them odds. Did I tell you my daddy lives there? He's the one that sent the picture postcard. Listen here to what he says about it... Butch pulls the postcard from his back pocket and reads... 'Dear Robert…
- after:  Alaska, Phillip. Wild and wooley. Man against nature. Me personally, I like them odds. Did I tell you my daddy lives there? He's the one that sent the picture postcard. Listen here to what he says about it... 'Dear Robert'... that's my real name, Phillip. Robert. Jus' like old Bo…

**#10875 — Inspector / The Man Who Knew Too Much**
- before: Thank you, Monsieur Drayton, but a translator will not be necessary. Won't you come inside, Monsieur, Madame? He stops aside and waits. Do to the kindness to wait. I might have questions for you later. He motions to the McKennas. Jo goes past him first into the office, followed b…
- after:  Thank you, Monsieur Drayton, but a translator will not be necessary. Won't you come inside, Monsieur, Madame? Do to the kindness to wait. I might have questions for you later. Your passports, please. You entered French Morocco four days ago. You are a doctor, monsieur? Three good…

**#10882 — Dean / Blue Valentine**
- before: Nope, I want you to come here first. I want you to laugh. Cindy opens the door and Dean scoots, making room for her. He lets out an "ow" before extending his hand. Come close. I want to hear you... I want to tell you... Shh, come here... Cindy reluctantly joins him on the bathroo…
- after:  Nope, I want you to come here first. I want you to laugh. Come close. I want to hear you... I want to tell you... Shh, come here... You want to hear a joke? OK. What's better than winning a gold medal at the Special Olympics? Not being retarded. Hey... that's not funny? How come …

<details><summary>needs_review — 54 ids</summary>

9774, 11808, 9879, 10879, 10571, 11670, 10925, 11208, 11268, 10945, 10966, 10454, 11240, 11500, 10843, 11407, 11421, 11519, 10927, 10498, 11535, 11631, 11661, 11944, 9814, 9815, 9881, 9903, 9930, 9671, 9692, 10094, 10112, 10145, 10186, 10307, 10351, 10502, 10762, 11073, 11105, 11156, 11232, 11447, 11620, 11683, 11680, 11709, 11849, 11878, 11905, 11977, 10757, 11523

</details>

## source_type = `tv`  (total 2224)

- clean (untouched): **2205** (99.1%)
- fixed_by_strip: **0**
- fixed_by_ai: **0**
- needs_review: **19**

### Sample AI repairs (before → after)

<details><summary>needs_review — 19 ids</summary>

13073, 13177, 12489, 12712, 13233, 13234, 13331, 13405, 13410, 13444, 13932, 13954, 13993, 14034, 14086, 14194, 14285, 14326, 14380

</details>
