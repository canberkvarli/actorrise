# Monologue Repair — APPLIED

Pipeline: strip → AI extract → gate. Fix applied only if it passes the quality gate; unsalvageable rows flagged `review_status=pending`.

AI model: `gpt-4o`

## source_type = `play`  (total 7072)

- clean (untouched): **6297** (89.0%)
- fixed_by_strip: **0**
- fixed_by_ai: **386**
- needs_review: **389**

### Sample AI repairs (before → after)

**#7595 — Tourist / A Comedy**
- before: Lady, for heaven's sake! Little Lady. Why is it so large, tell me. Cameras are small, but this one is so large. I swear I never had the faintest suspicion it was a camera. Can you take my picture? I would so much like to have my picture taken with the mountains here for a backgro…
- after:  Lady, for heaven's sake! Little Lady. Why is it so large, tell me. Cameras are small, but this one is so large. I swear I never had the faintest suspicion it was a camera. Can you take my picture? I would so much like to have my picture taken with the mountains here for a backgro…

**#12356 — Lavinia / Androcles and the Lion**
- before: That is the strange thing, Captain, that a little pinch of incense should make all that difference. Religion is such a great thing that when I meet really religious people we are friends at once, no matter what name we give to the divine will that made us and moves us. Oh, do you…
- after:  That is the strange thing, Captain, that a little pinch of incense should make all that difference. Religion is such a great thing that when I meet really religious people we are friends at once, no matter what name we give to the divine will that made us and moves us. Oh, do you…

**#9532 — Old Woman / John Millington Synge**
- before: The gods help the lot of us. . . . Shouldn’t she be well pleased getting the like of Conchubor, and he middling settled in his years itself? I don’t know what he wanted putting her this wild place to be breaking her in, or putting myself to be roasting her supper and she with no …
- after:  The gods help the lot of us. . . . Shouldn’t she be well pleased getting the like of Conchubor, and he middling settled in his years itself? I don’t know what he wanted putting her this wild place to be breaking her in, or putting myself to be roasting her supper and she with no …

**#12365 — Henry Apjohn (Her Lover) / How He Lied to Her Husband**
- before: Our course is perfectly simple, perfectly straightforward, perfectly stainless and true. We love one another. I am not ashamed of that: I am ready to go out and proclaim it to all London as simply as I will declare it to your husband when you see—as you soon will see—that this is…
- after:  Our course is perfectly simple, perfectly straightforward, perfectly stainless and true. We love one another. I am not ashamed of that: I am ready to go out and proclaim it to all London as simply as I will declare it to your husband when you see—as you soon will see—that this is…

**#12378 — Mark Antony / Antony and Cleopatra**
- before: All is lost; This foul Egyptian hath betrayed me: My fleet hath yielded to the foe; and yonder They cast their caps up and carouse together Like friends long lost. Triple-turn'd whore! 'tis thou Hast sold me to this novice; and my heart Makes only wars on thee. Bid them all fly; …
- after:  All is lost; This foul Egyptian hath betrayed me: My fleet hath yielded to the foe; and yonder They cast their caps up and carouse together Like friends long lost. Triple-turn'd whore! 'tis thou Hast sold me to this novice; and my heart Makes only wars on thee. Bid them all fly; …

**#12384 — Countess of Rousillon / All's Well That Ends Well**
- before: Yes, Helen, you might be my daughter-in-law: God shield you mean it not! daughter and mother So strive upon your pulse. What, pale again? My fear hath catch'd your fondness: now I see The mystery of your loneliness, and find Your salt tears' head: now to all sense 'tis gross You …
- after:  Yes, Helen, you might be my daughter-in-law: God shield you mean it not! daughter and mother So strive upon your pulse. What, pale again? My fear hath catch'd your fondness: now I see The mystery of your loneliness, and find Your salt tears' head: now to all sense 'tis gross You …

**#8814 — Scene--Scarborough And Its Neighbourhood


Prologue
Spoken By Mr / Richard Brinsley Sheridan**
- before: KING What various transformations we remark, From east Whitechapel to the west Hyde Park! Men, women, children, houses, signs, and fashions, State, stage, trade, taste, the humours and the passions; The Exchange, 'Change Alley, wheresoe'er you're ranging, Court, city, country, al…
- after:  What various transformations we remark, From east Whitechapel to the west Hyde Park! Men, women, children, houses, signs, and fashions, State, stage, trade, taste, the humours and the passions; The Exchange, 'Change Alley, wheresoe'er you're ranging, Court, city, country, all are…

**#12390 — Emilia / The Comedy of Errors**
- before: And thereof came it that the man was mad. The venom clamours of a jealous woman Poisons more deadly than a mad dog's tooth. It seems his sleeps were hinder'd by thy railing, And therefore comes it that his head is light. Thou say'st his meat was sauced with thy upbraidings: Unqui…
- after:  And thereof came it that the man was mad. The venom clamours of a jealous woman Poisons more deadly than a mad dog's tooth. It seems his sleeps were hinder'd by thy railing, And therefore comes it that his head is light. Thou say'st his meat was sauced with thy upbraidings: Unqui…

**#12395 — Jacques / As You Like It**
- before: All the world's a stage, And all the men and women merely players: They have their exits and their entrances; And one man in his time plays many parts, His acts being seven ages. At first the infant, Mewling and puking in the nurse's arms. And then the whining school-boy, with hi…
- after:  All the world's a stage, And all the men and women merely players: They have their exits and their entrances; And one man in his time plays many parts, His acts being seven ages. At first the infant, Mewling and puking in the nurse's arms. And then the whining school-boy, with hi…

**#12396 — Mrs. Erlynne / Lady Windermere's Fan**
- before: Believe what you choose about me. I am not worth a moment’s sorrow. But don’t spoil your beautiful young life on my account! You don’t know what may be in store for you, unless you leave this house at once. You don’t know what it is to fall into the pit, to be despised, mocked, a…
- after:  Believe what you choose about me. I am not worth a moment’s sorrow. But don’t spoil your beautiful young life on my account! You don’t know what may be in store for you, unless you leave this house at once. You don’t know what it is to fall into the pit, to be despised, mocked, a…

<details><summary>needs_review — 389 ids</summary>

12364, 12383, 12386, 12397, 4759, 4760, 4762, 4764, 2332, 2654, 9059, 8461, 7835, 12153, 12151, 5300, 5759, 8746, 8227, 4773, 2368, 4774, 8882, 5626, 2512, 2526, 2540, 2550, 8644, 2888, 2900, 4792, 4812, 3004, 3011, 8736, 3021, 3028, 3096, 3102, 3119, 3135, 3137, 3138, 3142, 3160, 3162, 3186, 3191, 3221, 3270, 3275, 3281, 3287, 1820, 3312, 3398, 3408, 3449, 3458, 3499, 3527, 4839, 3580, 3588, 3593, 3596, 3598, 3629, 2967, 2969, 2974, 8741, 3355, 4846, 4847, 3372, 3376, 4855, 863, 4893, 2382, 1242, 6857, 5095, 5134, 5186, 3701, 5254, 3706, 3016, 5336, 5348, 3715, 3278, 3374, 5484, 5550, 5585, 3710, 3740, 5659, 3736, 5742, 5752, 5769, 3747, 5776, 5783, 3754, 5800, 5818, 7956, 3772, 5912, 6018, 6021, 3886, 8702, 3888, 6069, 6081, 8764, 6156, 4676, 4763, 8229, 3801, 3818, 4844, 4272, 3829, 3833, 5079, 5180, 8581, 6921, 5199, 7327, 7767, 5378, 5432, 7860, 5552, 6983, 5609, 7905, 5624, 7928, 7963, 5744, 5787, 8109, 8127, 5821, 5862, 5801, 5932, 8277, 8335, 8436, 8437, 6208, 8492, 8753, 8612, 6320, 8641, 6332, 8660, 8138, 3898, 8691, 7245, 8727, 6753, 8742, 8754, 8759, 8786, 8792, 6988, 8805, 6993, 8769, 8838, 7028, 8770, 8963, 8973, 8991, 8151, 7535, 9142, 7778, 9284, 8790, 8787, 9026, 9206, 9264, 3926, 3929, 3939, 3963, 8024, 8936, 4030, 4058, 4073, 6293, 6297, 6305, 6343, 3371, 6532, 3395, 6587, 6600, 6758, 3587, 6774, 6914, 6990, 8222, 7009, 7011, 7013, 7022, 7024, 7025, 4141, 7125, 7166, 4752, 4824, 5066, 9107, 5125, 9132, 5359, 9202, 5398, 9216, 9257, 9265, 8661, 9279, 9280, 9281, 9296, 9297, 9298, 9539, 5875, 9585, 5215, 6817, 6748, 6755, 6989, 8772, 8791, 9144, 7794, 7939, 6754, 8452, 7225, 7229, 7238, 4834, 8051, 8059, 8596, 9295, 9301, 9286, 8731, 8985, 870, 21, 321, 4097, 1235, 1422, 1461, 1566, 4111, 1683, 4118, 4119, 4127, 2034, 2236, 2314, 4189, 4198, 4199, 4223, 4342, 4348, 4409, 4431, 4485, 4565, 4599, 4634, 4647, 4669, 4708, 4716, 4732, 4733, 7257, 7349, 7372, 7380, 7541, 7547, 2905, 3357, 263, 8136, 4361, 5245, 5404, 12002, 12016, 12017, 12023, 12046, 12015, 12026, 12028, 12031, 12045, 7398, 12092, 12107, 12114, 7845, 12143, 12146, 12177, 12295, 12318, 12338, 12354, 12048, 12054, 12059, 12062, 12066, 12071, 12077, 12079, 12113, 12170, 12174, 12186, 12188, 12204, 12208, 12228, 12234, 12242, 12251, 12263, 12265, 12276, 12283, 12285, 12324, 12328, 12339, 12346, 12347, 3667, 3809, 3812, 3980, 5388, 7328, 7329, 7536, 7717, 7974, 9006

</details>

## source_type = `film`  (total 1424)

- clean (untouched): **950** (66.7%)
- fixed_by_strip: **0**
- fixed_by_ai: **283**
- needs_review: **191**

### Sample AI repairs (before → after)

**#10590 — Ben / The Graduate**
- before: Elaine - that is not what happened. (She puts her hands on his shoulder.) All right - but listen to me. What happened was there was this party at my parents. I drove your mother home - then we went upstairs to see your portrait - (Elaine tightens her arms around his neck.) - and …
- after:  Elaine - that is not what happened. All right - but listen to me. What happened was there was this party at my parents. I drove your mother home - then we went upstairs to see your portrait - and when we got up in the room she starts taking her clothes off - and - suddenly there …

**#10613 — Charlie / The Perks of Being a Wallflower**
- before: For example, I am trying to participate by listening to Sam's collection of big rock ballads and thinking about love. Sam says they are kitschy and brilliant. I completely agree. I am also studying extra books outside of class. As it turns out, Mr. Anderson is a writer. He even h…
- after:  For example, I am trying to participate by listening to Sam's collection of big rock ballads and thinking about love. Sam says they are kitschy and brilliant. I completely agree. I am also studying extra books outside of class. As it turns out, Mr. Anderson is a writer. He even h…

**#10819 — Nell / The Haunting**
- before: I was just thinking how happy I am right now. All my life, I've been waiting for an adventure. And I thought, oh, I'll never have that, adventures are for people who travel long distances, that's for soldiers, that's for the women that the bullfighters fall in love with. And here…
- after:  I was just thinking how happy I am right now. All my life, I've been waiting for an adventure. And I thought, oh, I'll never have that, adventures are for people who travel long distances, that's for soldiers, that's for the women that the bullfighters fall in love with. And here…

**#10804 — Little Elphaba / Wicked**
- before: She already knows! Confident she got the last word, Little Elphaba turns to her baby sister, whose big eyes now look frightened. Oh, Nessarose, don't you worry-- I'm right here. I always will be. Elphaba takes Nessa's tiny hand into her own green hand, looks into her eyes, smiles…
- after:  Oh, Nessarose, don't you worry-- I'm right here. I always will be. Now. You want to see something wonderful...? This is all about the Wizard. Do you know how he got here? From the sky! In a balloon! See? Then he built a city made of emeralds, 'cause he loves emeralds. Even though…

**#12429 — Electra / Assassins**
- before: I don't know. When I was in college, I was forced to go to a psychiatrist because I was caught drilling holes in my dorm room floor. (Rath: And you were drilling these holes...?) So I could watch the girl that lived under me. (Rath: Apparently this doctor was unable to cure you.)…
- after:  I don't know. When I was in college, I was forced to go to a psychiatrist because I was caught drilling holes in my dorm room floor. So I could watch the girl that lived under me. He told me that my curiosity became unnaturally entangled with my sense of self-preservation. He bel…

**#12415 — ROY / The Apprentice**
- before: I might as well take this little lawsuit of your’s. Give the libs a kick in the nuts. Donald comes alive. (DONALD: That’s amazing, Roy.) Now keep your panties on! Powerful people hire me because I’m not the typical bill-by-the-hour do-nothing shyster. I won’t be pushed around. (D…
- after:  I might as well take this little lawsuit of your’s. Give the libs a kick in the nuts. Now keep your panties on! Powerful people hire me because I’m not the typical bill-by-the-hour do-nothing shyster. I won’t be pushed around. You're the client, but you work for me. That means yo…

**#12416 — ROY / The Apprentice**
- before: Everybody wants to be liked. To belong. I never did. I was too odd. Roy leans back. I wasn't like the other boys arguing after school if DiMaggio was better than Mantle. First time I whacked off, I had no idea what cum was. I told my parents I had a fatal disease. Donald is uneas…
- after:  Everybody wants to be liked. To belong. I never did. I was too odd. I wasn't like the other boys arguing after school if DiMaggio was better than Mantle. First time I whacked off, I had no idea what cum was. I told my parents I had a fatal disease. My advantage is I don't care wh…

**#12425 — BIGFOOT / Inherent Vice**
- before: Well, here it is anyway: Right now everyone is really scared. (DOC: Who? You? Me?) Odd, that fear should be running the town again as in days of old, like the Hollywood blacklist you don't remember and the Watts rioting you do -- it spreads, like blood in a swimming pool, till it…
- after:  Well, here it is anyway: Right now everyone is really scared. Odd, that fear should be running the town again as in days of old, like the Hollywood blacklist you don't remember and the Watts rioting you do -- it spreads, like blood in a swimming pool, till it occupies all the vol…

**#11518 — Fletcher / Whiplash**
- before: You realize I can cut you anytime I feel. (Andrew: You would've cut me by now.) Try me you weasel. At 5:30, that's in eleven minutes, my band is on-stage. You're not there with your own sticks, or you show up and make a single mistake -- a single one -- and I'll send you back to …
- after:  You realize I can cut you anytime I feel. Try me you weasel. At 5:30, that's in eleven minutes, my band is on-stage. You're not there with your own sticks, or you show up and make a single mistake -- a single one -- and I'll send you back to Nassau Band to turn pages until you gr…

**#12431 — BARNUM / The Greatest Showman**
- before: Mr. Roth -- when is the last time you smiled? Or had a good laugh? A real one? The simplicity of the question silences Roth. Barnum smiles. A joyless reporter covering the theater. Now who’s the fraud? Roth waves him off and starts to leave. Barnum stops him. By the way, Roth, Th…
- after:  Mr. Roth -- when is the last time you smiled? Or had a good laugh? A real one? A joyless reporter covering the theater. Now who’s the fraud? By the way, Roth, That word you used to describe my show -- It has a nice ring to it. I’m still here, Roth! I’m still here!

<details><summary>needs_review — 191 ids</summary>

10630, 10633, 10688, 10776, 12414, 10565, 12421, 10007, 12418, 12422, 10068, 11537, 10980, 12455, 9975, 12411, 12412, 12413, 10857, 12419, 10114, 11154, 11024, 11178, 10232, 10244, 11366, 11332, 11486, 11291, 11639, 10405, 11448, 10008, 10735, 11475, 11152, 11494, 11179, 11514, 9698, 9707, 9738, 9752, 11582, 9805, 9869, 9891, 9905, 11227, 9951, 9953, 9965, 9634, 9742, 9760, 10015, 10150, 9797, 10190, 10241, 10242, 11142, 10262, 10526, 10553, 10421, 10436, 10492, 10510, 10531, 10766, 11167, 11498, 11515, 11538, 11543, 9715, 11553, 11567, 11583, 11584, 11513, 11559, 11564, 11565, 11566, 11571, 11573, 11576, 11577, 11595, 11593, 11604, 11609, 11627, 11591, 11608, 11611, 11614, 11652, 11668, 11673, 11674, 11675, 11681, 11685, 11689, 11698, 11712, 11716, 11747, 11756, 11772, 11799, 11815, 11835, 11844, 11863, 11868, 11882, 11970, 11980, 11984, 11992, 11656, 11663, 11671, 11678, 11682, 11687, 11691, 11700, 11713, 11714, 11715, 11719, 11727, 11730, 11742, 11743, 11750, 11751, 11760, 11765, 11775, 11776, 11778, 11780, 11782, 11785, 11786, 11791, 11794, 11796, 11797, 11801, 11803, 11807, 11811, 11824, 11828, 11833, 11840, 11850, 11851, 11853, 11860, 11869, 11870, 11871, 11874, 11895, 11903, 11904, 11907, 11924, 11926, 11928, 11930, 11939, 11943, 11958, 11963, 11967, 11983, 11985, 11987, 11988, 11994, 12202

</details>

## source_type = `tv`  (total 2224)

- clean (untouched): **1409** (63.4%)
- fixed_by_strip: **815**
- fixed_by_ai: **0**
- needs_review: **0**

### Sample AI repairs (before → after)

<details><summary>needs_review — 0 ids</summary>



</details>
