/**
 * English copy for the "seo" pages: the keyword landing pages, the guides, the
 * sources page, the 12k ISR monologue pages and the collection shelves.
 * Top-level keys are namespaces; keep them unique across files.
 *
 * Only the page chrome lives here. Monologue text, play titles, character and
 * author names, tones and anything else the API hands back stay as data.
 * {name} is interpolated; on these pages a {name} that is not a var is a slot,
 * a server-rendered link or <strong> that SeoT drops into the sentence.
 *
 * These strings are also the source of the pages' FAQ JSON-LD, so the English
 * here must stay byte-identical to what Google was shown.
 */
export const seo = {
  seoCommon: {
    faqTitle: "Frequently asked questions",
    commonQuestions: "Common questions",
    searchesActorsRun: "Searches actors actually run",
    trySearch: "Try the search",
    search19k: "Search 19,000+ monologues",
    related: "Related: ",
    links: {
      dramatic: "dramatic monologues",
      contemporary: "contemporary monologues",
      shakespeare: "Shakespeare monologues",
      classical: "classical monologues",
      men: "monologues for men",
      women: "monologues for women",
      comedicWomenUnder2: "comedic monologues for women under 2 minutes",
      finder: "monologue finder",
      audition: "audition monologues",
      pricing: "pricing page",
    },
    cat: {
      dramatic: "Dramatic monologues",
      contemporary: "Contemporary monologues",
      shakespeare: "Shakespeare monologues",
      women: "Monologues for women",
      men: "Monologues for men",
      twoMin: "2 minute monologues",
      oneMin: "1 minute monologues",
      classical: "Classical monologues",
    },
  },

  /** Hero stage directions. StageHero takes a string today; see the report. */
  seoDirections: {
    finder: "(the search.)",
    database: "(the database.)",
    audition: "(the audition.)",
    contemporary: "(the modern canon.)",
    dramatic: "(the dramatic register.)",
    men: "(the men's roles.)",
    women: "(the women's roles.)",
    shakespeare: "(the bard.)",
    howTo: "(finding the piece.)",
    rehearsal: "(the work.)",
    auditionAi: "(the callback.)",
    scenePartner: "(the rehearsal.)",
    sources: "(the source texts.)",
    twoMin: "(two minutes.)",
    oneMin: "(sixty seconds.)",
    comedicWomen: "(land the laugh.)",
    contemporaryWomen: "(modern voices.)",
    dramaticMen: "(dig deep.)",
    teens: "(young performers.)",
    movie: "(from the screen.)",
    shakespeareWomen: "(the bard's women.)",
    classical: "(the classics.)",
    comedicWomanUnder2: "(quick comedy.)",
    dramaticContemporary: "(modern drama.)",
  },

  seoFinder: {
    title: "Monologue finder: find your next {em} in seconds",
    titleEm: "audition piece",
    lede:
      "ActorRise is a monologue finder and database built for actors. Instead of scrolling books or generic lists, you describe what you need in plain English and get a shortlist of real monologues in seconds. No keyword guessing, no flipping through anthologies the night before a callback.",
    b1: "One of the largest searchable monologue databases online",
    b2: "AI search that understands “comedic woman under 2 minutes” or “angry contemporary male”",
    b3: "Real scripts from playwrights, not AI-generated text",
    b4: "Overdone filter so you can bring something fresh to the room",
    tryFinder: "Try the monologue finder",
    howTitle: "How the monologue finder works",
    step1Strong: "Describe the piece you need.",
    step1:
      "{strong} Type something like “comedic woman under two minutes” or “intense contemporary male for a drama callback.” The search reads meaning, not just exact keywords.",
    step2Strong: "Scan a ranked shortlist.",
    step2:
      "{strong} You get real monologues that match your tone, length, gender, and style, pulled from plays, films, and TV.",
    step3Strong: "Save, filter, and rehearse.",
    step3: "{strong} Bookmark the ones you like, hide overdone pieces, and take the strongest option into the room.",
    searchesIntro:
      "You don’t have to translate what you need into the right keywords. Type it the way you’d say it to a friend:",
    samples: {
      s1: "two minute dramatic monologue for a young woman",
      s2: "comedic monologue for a man, contemporary, under 90 seconds",
      s3: "a classical monologue that is not Shakespeare",
      s4: "modern breakup monologue, female, high stakes",
      s5: "uplifting monologue for a college audition",
    },
    searchesOutro: "Every result is a real published piece, so you can trust the text and look up the source.",
    realTitle: "Real scripts, not AI-generated lines",
    real1:
      "ActorRise doesn’t invent monologues. The AI is in the search, not the writing. Every result is a real piece from a play, film, or TV script, so what you rehearse is what casting will recognize. When a piece gets overused, the Overdone filter flags it, so you can bring something fresh instead of the monologue three other people read that same day.",
    real2:
      "I built ActorRise because I’m an actor, and finding the right monologue used to eat hours I’d rather spend rehearsing.",
    builtTitle: "Built for actors, students, and coaches",
    built:
      "Whether you’re prepping a professional audition, a {college}, or coaching a class as a {teacher}, the finder works the same way. Once you’ve picked your piece, rehearse it out loud with {scenePartner}, which reads the other lines so you can run it anytime. You can also browse curated {audition} by style and length.",
    lCollege: "college audition",
    lTeacher: "teacher",
    faq: {
      q1: "How is this different from a normal monologue list?",
      a1: "Lists make you scroll and guess at keywords. The finder reads what you describe in plain English and ranks pieces that actually fit your tone, length, and type, so you skip the digging.",
      q2: "Are the monologues free?",
      a2: "There’s a free tier, and you don’t need a credit card to try it. Paid plans unlock the full database, saved bookmarks, and ScenePartner rehearsal.",
      q3: "Can I search by length, gender, and tone?",
      a3: "Yes. Describe the length (for example under two minutes), gender, tone, and style, and filter the shortlist until it fits the room you’re walking into.",
      q4: "Where do the monologues come from?",
      a4: "ActorRise organizes real published text, and every piece links back to its source and original publication. We never host full scripts of copyrighted works. Full details: ",
      link: "Sources & copyright",
    },
  },

  seoDatabase: {
    title: "The {em} built for actors",
    titleEm: "monologue database",
    lede:
      "ActorRise is a searchable monologue database: {count} real pieces from plays, film and television. You search by what you actually need, tone, length, gender, age, theme, the play, the show, and read the real text in seconds. Public-domain plays are printed in full.",
    countedTitle: "What is in it, counted",
    stats: {
      pieces: "Monologues",
      plays: "From plays",
      film: "From film",
      tv: "From television",
      publicDomain: "Public domain, printed in full",
      underTwo: "Under two minutes",
    },
    stat: "{n}",
    newest: "Newest piece added {date}. ",
    countsNote:
      "Counts are from the live library and refresh weekly. Every piece is a published text with its character, source and author; nothing here was written by a model.",
    howTitle: "How the search works",
    howIntro:
      "You do not have to guess the right keywords. Describe what you need the way you would say it out loud, and the search ranks pieces that fit:",
    samples: {
      s1: "two minute dramatic monologue for a young woman",
      s2: "comedic contemporary monologue for a man under 90 seconds",
      s3: "a classical monologue that is not Shakespeare",
      s4: "something from Euphoria, or anything with that feeling",
    },
    searchDb: "Search the database",
    browseTitle: "Browse the database",
    browseIntro:
      "Each page below is a real list from the library, not a landing page: the pieces, their characters, sources and running times, and the public-domain text in full.",
    shelf: {
      playH: "By play, every speech printed in full",
      playN: "Public-domain plays, so the whole text is on the page.",
      showH: "By show",
      showN: "Copyrighted, so each entry names the character, piece and length and the search opens the rest.",
      themeH: "By theme",
      themeN: "Tagged across the whole library, classical and contemporary.",
      shelfH: "By gender, age, tone and length",
      shelfN: "The audition asks that never change.",
    },
    wider: "Wider categories",
    faq: {
      q1: "How big is the monologue database?",
      a1: "{pieces} real monologues: {plays} from plays, {film} from film and {tv} from television, across more than two thousand sources. {publicDomain} of them are public domain and printed in full. It grows most weeks; the newest piece is dated on this page.",
      q2: "Are the monologues free to search and read?",
      a2: "Yes. Searching is free and needs no card. A free account reads a set number of full pieces a month; Plus removes the limit and adds unlimited rehearsal with the AI scene partner.",
      q3: "Are these real monologues or AI-generated?",
      a3: "Real. The AI is in the search, not the writing. Every entry is a published piece with its character, source and author, so the text you rehearse is text a casting room will recognise.",
      q4: "Can I filter out overdone pieces?",
      a4: "Yes. Every piece carries an overdone score, from fresh to warhorse, and the search can hide the ones every actor brings.",
      q5: "Can I search by play, show, theme or age?",
      a5: "Yes. Type it the way you would say it: \"a monologue from Hamlet\", \"something about revenge\", \"comedic, teenager, under two minutes\". The browse pages below cover the most asked-for shelves.",
      q6: "Where do the monologues come from?",
      a6: "Public-domain plays, printed in full, and licensed or referenced contemporary sources, listed by character, work and length. ActorRise does not distribute copyrighted scripts. Full details: ",
      link: "Sources and copyright",
    },
    ctaTitle: "Search {count} monologues now",
    ctaBody: "Find the right piece, read the real text, and rehearse it. Free to start, no credit card.",
  },

  seoAudition: {
    titleEm: "Audition",
    title: "{em} monologues for every casting need.",
    lede:
      "Whether you need classical, contemporary, or comedic audition monologues, ActorRise lets you search 19,000+ real pieces by style, length, gender, and tone. The AI finds what fits, so you spend less time digging and more time rehearsing.",
    searchBtn: "Search audition monologues",
    b1: "{link} : Shakespeare and beyond",
    b1Link: "Classical monologues",
    b2: "{link} : from modern plays",
    b2Link: "Dramatic contemporary",
    b3Link: "Comedic (e.g. woman under 2 minutes)",
    b4: "Overdone filter so you can bring something different to the room",
    pickTitle: "How to pick the right audition monologue",
    pickIntro: "The strongest choice usually comes down to three things, and you can filter for all of them:",
    p1Strong: "Fit your type and the role.",
    p1: "{strong} Search by gender, age range, and tone so the piece reads like it belongs to you.",
    p2Strong: "Respect the time limit.",
    p2: "{strong} Most calls want one to two minutes. Filter by length so you’re never cut off.",
    p3Strong: "Bring something fresh.",
    p3: "{strong} The Overdone filter flags pieces casting hears constantly, so you can stand out instead of blend in.",
    browseTitle: "Browse by type",
    browse:
      "Start with a category, then narrow it down: {classical} for Shakespeare and period pieces, {dramatic} for modern plays, or {comedic} when you need to land a laugh. You can also start from the {finder} and describe exactly what you’re after.",
    lClassical: "classical",
    lDramatic: "dramatic contemporary",
    lComedic: "comedic",
    searchesIntro: "Type it the way you’d say it out loud:",
    samples: {
      s1: "contemporary dramatic monologue for a woman, under two minutes",
      s2: "comedic audition monologue for a man",
      s3: "a classical monologue that isn’t Shakespeare",
      s4: "audition monologue for a teen",
      s5: "high stakes monologue for a callback",
    },
    realTitle: "Real pieces, not AI-generated lines",
    real1:
      "Every monologue is from a published play or a licensed source, never invented by a model. The AI is in the search, so what you rehearse is text casting will recognize. Once you’ve picked your piece, run it out loud with {scenePartner}.",
    real2: "I’m an actor, and I built ActorRise so the search part takes minutes instead of an evening.",
    faq: {
      q1: "What makes a good audition monologue?",
      a1: "Something that fits your type and the role, lands inside the time limit, and that casting hasn’t already heard ten times that day. The search and the Overdone filter help with all three.",
      q2: "How long should an audition monologue be?",
      a2: "Most calls want one to two minutes. You can filter by length, so search something like “dramatic monologue under two minutes” and trust the results fit.",
      q3: "Do you have contemporary and classical pieces?",
      a3: "Both. Browse classical (Shakespeare and beyond), dramatic contemporary, and comedic pieces, or just describe what you want and let the search sort it.",
      q4: "Where do the monologues come from?",
      a4: "ActorRise organizes real published text, and every piece links back to its source and original publication. We never host full scripts of copyrighted works. Full details: ",
      link: "Sources & copyright",
    },
  },

  seoContemporary: {
    title: "Contemporary monologues for {em}.",
    titleEm: "auditions",
    lede:
      "Modern plays, current voices, pieces that feel alive. Search contemporary monologues by tone, character type, or theme. The AI understands what you mean, so \"funny monologue from a recent play about family\" actually works.",
    searchBtn: "Search contemporary monologues",
    also: "Also try {dramatic}, {men}, or {shakespeare}.",
    q1: "What counts as a contemporary monologue?",
    a1: "Generally anything written from the 1950s onward, though most people mean the last 20 to 30 years. If the audition asks for \"contemporary,\" they usually want something modern that sounds like how people actually talk today.",
    q2: "Why do auditions ask for a contemporary monologue?",
    a2: "Casting wants to see how you handle realistic, everyday language. Contemporary pieces show your natural instincts without the added challenge of verse or heightened text.",
    q3: "Can I search by playwright or play title?",
    a3: "Yes. You can search by playwright name, play title, or describe the kind of piece you want. Try something like \"monologue from a play about siblings\" and the AI will find relevant matches.",
  },

  seoDramatic: {
    title: "Dramatic monologues for {em}.",
    titleEm: "auditions",
    lede:
      "Serious, emotional, high-stakes. Search dramatic monologues by tone, era, or character type. Whether you need something gut-wrenching or quietly intense, the AI matches you to real pieces from published plays. No keyword guessing.",
    searchBtn: "Search dramatic monologues",
    also: "Looking for something specific? Try {shakespeare}, {contemporary}, or {women}.",
    q1: "What makes a good dramatic monologue for an audition?",
    a1: "A good dramatic monologue has clear stakes, a shift in emotion, and something for you to play. Avoid pieces that are just sad from start to finish. Look for a monologue where the character wants something and is actively trying to get it.",
    q2: "How do I find a dramatic monologue that isn't overdone?",
    a2: "ActorRise has an Overdone filter that flags monologues casting directors see constantly. Search for what you need, then toggle the filter to surface fresh material that still fits the tone.",
    q3: "Can I rehearse my dramatic monologue on ActorRise?",
    a3: "Yes. {link} lets you rehearse scenes and monologues with AI reading the other lines. Save any monologue and practice it directly in the app.",
  },

  seoMen: {
    title: "Monologues for {em}.",
    titleEm: "men",
    lede:
      "Comedic, dramatic, classical, contemporary. Search monologues for men by tone, length, age range, or character type. Describe what you need in plain English, like \"conflicted father, serious tone, under 2 minutes\" and get real matches from published plays.",
    searchBtn: "Search monologues for men",
    also: "Browse by category: {dramatic}, {shakespeare}, or {contemporary}.",
    q1: "What are good monologues for men that aren't overdone?",
    a1: "The Overdone filter on ActorRise flags pieces that casting directors see constantly. Search for what you need, toggle the filter, and you'll get fresh material that still fits the tone of your audition.",
    q2: "Should I do a comedic or dramatic monologue?",
    a2: "Match the tone of the project. If the audition doesn't specify, go with whichever shows your range better. Some actors keep one of each ready. You can search for both and save them to your library.",
    q3: "Can I practice my monologue with AI?",
    a3: "Yes. {link} lets you run through scenes and monologues with AI reading the other parts. No need to find a scene partner.",
    a3Link: "ActorRise's rehearsal tool",
  },

  seoWomen: {
    title: "Monologues for {em}.",
    titleEm: "women",
    lede:
      "Comedic, dramatic, classical, contemporary. Search monologues for women by tone, length, age range, or character type. Describe what you need in plain English, like \"fierce woman standing up for herself, under 2 minutes\" and get real matches from published plays.",
    searchBtn: "Search monologues for women",
    also: "Browse by category: {comedic}, {dramatic}, or {contemporary}.",
    q1: "How do I pick the right monologue for an audition?",
    a1: "Match the tone of the show. If you're auditioning for a comedy, bring a comedic piece. If the breakdown mentions a specific age range or type, search for that. The Overdone filter helps you avoid pieces casting directors have heard a thousand times.",
    q2: "Can I filter monologues by age range?",
    a2: "Yes. Describe the age range in your search, like \"monologue for woman in her 20s\" or \"older woman, 50s, serious.\" The AI understands natural language so you don't need to pick from dropdown menus.",
    q3: "Can I rehearse monologues on ActorRise?",
    a3: "Yes. Save any monologue and rehearse it with {link}, which reads the other lines out loud so you can practice on your own.",
  },

  seoShakespeare: {
    title: "{em} monologues for auditions.",
    lede:
      "Hamlet, Macbeth, Twelfth Night, A Midsummer Night's Dream, and dozens more. Search Shakespeare monologues by character, tone, or length. The AI understands what you need, so you can search like \"angry speech from a king\" or \"comedic woman from a Shakespeare comedy\" and get real matches.",
    searchBtn: "Search Shakespeare monologues",
    also: "Also browse {classical}, {dramatic}, or {contemporary}.",
    q1: "What Shakespeare monologues are good for auditions?",
    a1: "It depends on the role. For drama, Hamlet, Macbeth, and Othello have strong options. For comedy, try Twelfth Night, A Midsummer Night's Dream, or Much Ado About Nothing. The best audition monologue is one that fits the tone of the show you're auditioning for. Use the search to filter by tone and character type.",
    q2: "How long should a Shakespeare monologue be for an audition?",
    a2: "Most auditions ask for 1 to 2 minutes. That's roughly 15 to 25 lines of verse. If the listing doesn't specify, aim for under 90 seconds. You can filter by length in the search.",
    q3: "Does ActorRise have the full text of Shakespeare monologues?",
    a3: "Yes. Shakespeare's works are in the public domain, so we include full monologue text you can read, save, and rehearse with {link}.",
  },

  seoHowTo: {
    title: "How to find a {em} for your audition",
    titleEm: "monologue",
    lede:
      "Finding the right monologue is where most of the stress lives: the wrong length, an overdone piece, or something that just is not you. Here is a simple way to find one that fits, fast, without flipping through anthologies the night before a callback.",
    findNow: "Find a monologue now",
    s1Title: "1. Start with what the audition actually needs",
    s1Intro:
      "Before you fall in love with a piece, get clear on the brief. The fastest way to waste an hour is to pick something beautiful that the room did not ask for. Nail down four things:",
    lengthStrong: "Length.",
    length: "{strong} Most auditions want 60 seconds to 2 minutes. If the breakdown gives a number, respect it, and time yourself out loud.",
    toneStrong: "Tone.",
    tone: "{strong} Comedic or dramatic. Match the project. A serious drama callback is not the place for your best stand up bit.",
    eraStrong: "Era.",
    era: "{strong} Contemporary or classical. Some programs and schools ask for one of each, so know which you are building.",
    youStrong: "You.",
    you: "{strong} Your age range, casting type, and what you play believably. The piece should sit inside your wheelhouse, not audition for a different actor.",
    s2Title: "2. Search by meaning, not by luck",
    s2Intro:
      "You can dig through monologue books and generic lists, but that means scrolling and guessing at keywords. It is faster to describe what you need the way you would say it to a friend and let a real database do the sorting:",
    samples: {
      s1: "two minute dramatic monologue for a young woman",
      s2: "comedic monologue for a man, contemporary, under 90 seconds",
      s3: "a classical monologue that is not Shakespeare",
      s4: "modern breakup monologue, female, high stakes",
    },
    s2Outro:
      "That is exactly what the {link} does. It reads what you describe and ranks real monologues that fit your tone, length, gender, and type, pulled from 19,000+ pieces across plays, film, and TV.",
    s2Link: "ActorRise monologue finder",
    s3Title: "3. Pick one that works, and skip the overdone ones",
    s3p1:
      "A good audition monologue is playable, active, and fresh. Once you have a shortlist, choose the piece that lets you do something, has a real shift or stakes, and is not the same warhorse every other actor is bringing that day. The most cut pieces are the famous ones, so use the overdone filter to hide them and surface something the panel has not heard twelve times already.",
    s3p2:
      "Read the full text, check the source, and make sure it stands on its own out of context. If it needs the whole play to make sense, keep looking.",
    s4Title: "4. Rehearse it until it is off the page",
    s4p:
      "Finding the piece is half the job. Once it is yours, run it out loud until it is off book and in your body. On ActorRise you can rehearse a monologue right after you find it: a spotlight follows your voice line by line so you can get it off the page before you ever walk into the room.",
    browseTitle: "Browse by what you need",
    faq: {
      q1: "How do I find a monologue that fits me?",
      a1: "Start with what the audition asks for (length, tone, contemporary or classical), then narrow to your age range and type. Describe that in plain English and search a real database instead of scrolling anthologies. ActorRise ranks pieces that match your tone, length, and type in seconds.",
      q2: "Where can I find monologues for free?",
      a2: "There is a free tier on ActorRise and you do not need a credit card to try it. You can search and read real published monologues right away; paid plans unlock unlimited rehearsals with the AI.",
      q3: "How long should an audition monologue be?",
      a3: "Most auditions want 60 seconds to 2 minutes unless the breakdown says otherwise. Always time it out loud, and have a shorter cut ready in case they ask you to trim.",
      q4: "How do I avoid an overdone monologue?",
      a4: "The most cut pieces are the ones every actor brings. Use the overdone filter to hide warhorses and surface fresher options that still fit your tone and type.",
      q5: "Where do the monologues come from?",
      a5: "From public domain and licensed sources. ActorRise organizes real published text and does not distribute copyrighted play scripts. Full details: ",
      link: "Sources & copyright",
    },
    ctaTitle: "Find your monologue in seconds",
    ctaBody:
      "Describe what you need, get a shortlist of real pieces, and rehearse the strongest one. Free to start, no credit card.",
  },

  seoRehearsal: {
    title: "AI {em} tool for actors",
    titleEm: "rehearsal",
    lede:
      "Find your material and rehearse it in one place. ActorRise combines AI monologue search with ScenePartner, a rehearsal tool that reads the other lines out loud so you can practice scenes and monologues on your own schedule.",
    b1Strong: "Find material",
    b1: "{strong}: search 19,000+ monologues and films, and TV by meaning, not keywords.",
    b2Strong: "Rehearse scenes",
    b2: "{strong}: ScenePartner reads the other lines, listens for your cues, and keeps the scene moving.",
    b3Strong: "Audition prep",
    b3: "{strong}: Overdone filter, fit-to-type matching, and side-running so you walk in ready.",
    learnSp: "Learn about ScenePartner",
    looking: "Looking for material? Try the {finder}, browse {audition}, or explore {women} and {men}.",
    q1: "Is ActorRise free to use?",
    a1: "Yes. The free tier gives you access to monologue search and limited ScenePartner sessions. No credit card required. Check the {pricing} for details on paid plans.",
    q2: "How is this different from rehearsing with a friend?",
    a2: "It's available whenever you need it. No scheduling, no asking for favors. ScenePartner reads the lines consistently every time, which is great for drilling memorization and working on your choices before you bring it to a real scene partner.",
    q3: "What kind of material can I rehearse?",
    a3: "Anything. Monologues and scenes from the 19,000+ piece database, your own sides or scripts that you paste in, or film and TV monologues from our library.",
  },

  seoAuditionAi: {
    title: "Audition AI that helps you {em}, not replace performance",
    titleEm: "prep",
    lede:
      "ActorRise uses AI to help you find the right material and rehearse, without generating scripts or replacing the work you do as an actor. Everything you search and practice with is from real published plays and film/TV.",
    b1Strong: "Monologue search",
    b1: "{strong}: describe what you need in plain English. It matches you to 19,000+ real monologues by meaning, not just keywords.",
    b2: "{strong}: rehearse scenes with AI that reads the other lines. Run sides, film/TV references, and your saved monologues so you can walk in ready.",
    b3Strong: "Audition Mode",
    b3: "{strong}: fit-to-type and Overdone filters so you show up with pieces that suit the role and feel fresh to casting.",
    b4: "It finds and organizes real text. It doesn’t invent or generate monologues.",
    whatTitle: "What the AI does, and what it doesn’t",
    what1:
      "A lot of “AI for actors” means a model writing fake scenes. ActorRise works the other way. The AI reads what you describe and points you to real published pieces, and it reads scene partner lines back to you so you can rehearse. It never writes the monologue.",
    what2:
      "That matters in the room. Casting recognizes real material, and a piece you can attribute to a play or film holds up to questions in a way a generated one never will.",
    searchTitle: "Monologue search",
    search:
      "Type something like “contemporary dramatic monologue for a woman under two minutes” and get a ranked shortlist of real pieces that fit. No keyword guessing. Start from the {finder} or browse {audition} by type.",
    sp: "Rehearsing alone is the hard part. ScenePartner reads the other lines so you can run a scene or a monologue out loud whenever you want, without booking a friend. See how it works on the {link}.",
    spLink: "ScenePartner page",
    modeTitle: "Audition Mode and the Overdone filter",
    mode1:
      "When you’re prepping for a specific call, Audition Mode narrows things to your type and the role, and the Overdone filter flags pieces casting hears constantly so you can bring something they haven’t.",
    mode2:
      "I built ActorRise because I’m an actor, and I wanted prep tools that respect the craft instead of trying to do it for me.",
    faq: {
      q1: "Does ActorRise write monologues with AI?",
      a1: "No. The AI is in the search and the rehearsal, not the writing. Every monologue is a real published piece, so what you bring is something casting can recognize.",
      q2: "What is ScenePartner?",
      a2: "An AI reading partner. It reads the other lines in a scene so you can run sides or your monologue out loud anytime, without scheduling someone to feed you cues.",
      q3: "What is Audition Mode?",
      a3: "A focused setup with fit-to-type and Overdone filters, so you walk in with pieces that suit the role and feel fresh to casting.",
      q4: "Is there a free tier?",
      a4: "Yes, it’s free to start and no credit card is required. Paid plans unlock the full database, saved bookmarks, and ScenePartner rehearsal.",
    },
  },

  seoScenePartner: {
    title: "Scene partner AI: {em} anytime, no scheduling",
    titleEm: "rehearse",
    lede:
      "ScenePartner reads the other lines out loud so you can rehearse scenes on your own. Run your sides before an audition, practice film and TV scenes, or work through monologues with context. It listens for your lines and responds with the next cue.",
    b1Strong: "Run sides",
    b1: "{strong}: paste or upload your audition sides and rehearse with AI reading the other parts.",
    b2Strong: "Film & TV scenes",
    b2: "{strong}: rehearse from monologues extracted from iconic screenplays.",
    b3Strong: "No scheduling",
    b3: "{strong}: rehearse at 2am, on the subway, or five minutes before your audition. No favors needed.",
    learnMore: "Learn more about Audition AI",
    need: "Need material first? Try the {finder} or browse {dramatic} and {contemporary}.",
    q1: "How does ScenePartner AI work?",
    a1: "Pick a scene or monologue, choose which character you want to play, and hit start. ScenePartner reads the other lines out loud using text-to-speech. It listens for your cue lines and advances automatically, so you can rehearse hands-free.",
    q2: "Is ScenePartner free?",
    a2: "The free tier includes limited ScenePartner sessions. For unlimited rehearsal, check the {pricing}.",
    q3: "Can I use my own sides or scripts?",
    a3: "Yes. You can paste or upload your own audition sides and rehearse them with ScenePartner. It works with any text, not just material from the ActorRise database.",
  },

  seoSources: {
    title: "Sources & {em}.",
    titleEm: "copyright",
    lede:
      "ActorRise is a search and discovery tool for monologues. Public domain work is carried in full. Anything still in copyright appears only as a short excerpt, one speech, with attribution and a link back to the original. We never host the full script of a copyrighted work.",
    whereTitle: "Where our content comes from",
    pdStrong: "Works in the public domain",
    pd: "{strong}: plays whose copyright has expired, such as Shakespeare, Ibsen, Chekhov, Molière and Wilde, mostly from Project Gutenberg. These are out of copyright, so we carry the speech in full and link back to the edition it came from.",
    crStrong: "Film, television and contemporary plays still in copyright",
    crExcerpt: "short excerpt",
    cr: "{strong}: we carry a {excerpt} only, a single character’s speech of roughly a hundred and thirty words, taken from a screenplay or script tens of thousands of words long. Every excerpt names the title, the writer and the character, and links out to buy or read the full work. These excerpts are used under fair use, not under a licence from the rights holder, and we do not claim any ownership of them.",
    noneStrong: "Works we hold no text for at all",
    none: "{strong}: for some titles we list only the play, the character and a link to the publisher, with no text on the page. If we have no clear basis to reproduce a passage, we would rather point you to it than quote it.",
    fullTitle: "Full scripts",
    full: "We never host or distribute the full script of any copyrighted play, film or show, and we have no way for anyone to obtain one here. ActorRise is for finding and rehearsing a single audition piece. When you want the whole work, we point you at the publisher or a licensed seller, which is where it should be bought.",
    removalTitle: "Content removal",
    removal:
      "If you are a rights holder, or represent one, and would like an excerpt removed or corrected, email {email} with a link to the piece. Requests are honored promptly, usually within a day.",
    questions: "If you have questions about a specific source or copyright, please {contact}.",
    contactLink: "contact us",
  },

  /** The ~12k ISR pages at /monologues/<character>-<play>-<id>. */
  seoMonologue: {
    eyebrow: "Monologue",
    titleFrom: "{character} Monologue from {play}",
    titleOnly: "{character} Monologue",
    from: "From {play}",
    by: " by {author}",
    rehearseThisFree: "Rehearse this free",
    findMore: "Find more monologues",
    copyrightFilm:
      "This piece is from a copyrighted film, so the full text isn't published here. You can bring your own copy of the lines and rehearse it on ActorRise.",
    copyrightTv:
      "This piece is from a copyrighted TV series, so the full text isn't published here. You can bring your own copy of the lines and rehearse it on ActorRise.",
    copyrightWork:
      "This piece is from a copyrighted work, so the full text isn't published here. You can bring your own copy of the lines and rehearse it on ActorRise.",
    about: "About this piece",
    ageUp: "{age} and up",
    lenMin: "{mm}:{ss} min",
    lenSec: "{ss} sec",
    rehearseTitle: "Rehearse {character}'s monologue",
    rehearseBody:
      "Run it out loud with a spotlight that follows your voice, line by line, until it's off the page. Free to start, no credit card.",
    rehearseFree: "Rehearse free",
    moreFrom: "More from {play}",
    everySpeech: "Every speech from {play}, printed in full",
    browse: "Browse",
    wholeDb: "The whole database",
  },

  /** The keyword shelves at /monologues/<collection-slug>. */
  seoCollection: {
    searchAll: "Search all of them",
    nothing: "Nothing matched this shelf right now. {link}.",
    fromPlay: " from {play}",
    film: "film",
    tv: "TV",
    play: "play",
    lenMin: "{len} min",
    lengthNote:
      "Length is estimated at a performing pace of about 130 words a minute, with a breath at each sentence. Public-domain pieces are printed in full on their own page; copyrighted ones list the character and the source.",
    notYet: "Not the one yet?",
    notYetBody:
      "Describe the piece the way you would to a coach and the search reads the whole corpus, not this shelf. Free to start, no credit card.",
    searchCorpus: "Search the corpus",
  },

  seoGhostLight: {
    line: "Learning this one? {link} keeps your saved pieces on your phone and reads them offline, in the wings or on the train. Free on iPhone.",
  },

  /** The hand-written shelves under app/(marketing)/monologues/<name>. */
  seoShelf: {
    twoMin: {
      h1: "Two minute monologues",
      intro:
        "Two minutes is the most common audition length, long enough to show range without losing the room. Search real monologues and filter by tone and type to find a two minute piece that fits.",
      b1: "Filter to pieces that land around two minutes",
      b2: "Classical, contemporary, comedic, or dramatic",
      b3: "Overdone filter so your two minutes feel fresh",
      r1: "one minute monologues",
      r2: "audition monologues",
      r3: "monologue finder",
    },
    oneMin: {
      h1: "One minute monologues",
      intro:
        "Some calls give you sixty seconds, and going over can cost you. Search real monologues and filter to short pieces so you have a strong one minute option ready for auditions, class, or a quick self tape.",
      b1: "Filter to short pieces that fit a one minute slot",
      b2: "Comedic or dramatic, for any type",
      b3: "Real published text, with an Overdone filter",
      r1: "two minute monologues",
      r2: "audition monologues",
      r3: "monologue finder",
    },
    comedicWomen: {
      h1: "Comedic monologues for women",
      intro:
        "Comedy is hard to fake in an audition, so the piece has to fit you. Search 19,000+ real monologues by tone and length to find a comedic piece for a woman that actually lands, then filter out the ones casting hears every day.",
      b1: "Search by length, like a comedic monologue under two minutes",
      b2: "Real pieces from plays, films, and TV, never AI-generated",
      b3: "Overdone filter so you bring something casting hasn't heard ten times",
      r1: "contemporary monologues for women",
      r2: "monologues for women",
      r3: "audition monologues",
    },
    contemporaryWomen: {
      h1: "Contemporary monologues for women",
      intro:
        "Casting often asks for something contemporary, meaning modern and recognizable. Search real monologues for women from current plays, films, and TV, and filter by tone and length so the piece fits the room.",
      b1: "Modern pieces from real plays and screen, not invented text",
      b2: "Filter by tone, age range, and length",
      b3: "Overdone filter flags pieces casting hears constantly",
      r1: "comedic monologues for women",
      r2: "contemporary monologues",
      r3: "monologues for women",
    },
    dramaticMen: {
      h1: "Dramatic monologues for men",
      intro:
        "A strong dramatic monologue gives you somewhere to go. Search real pieces for men by intensity, age range, and length, and bring something that suits your type instead of the speech everyone else is doing.",
      b1: "Real dramatic pieces from plays, films, and TV",
      b2: "Filter by length, like a dramatic monologue under two minutes",
      b3: "Overdone filter so you stand out, not blend in",
      r1: "dramatic monologues",
      r2: "monologues for men",
      r3: "audition monologues",
    },
    teens: {
      h1: "Monologues for teens",
      intro:
        "Teen actors need pieces that fit their age and read honestly, not adult speeches forced to work. Search real monologues by age range, tone, and length to find audition and class material that suits a younger performer.",
      b1: "Filter by age range so the piece fits a teen",
      b2: "Comedic and dramatic options for class or auditions",
      b3: "Real published text, free to start",
      r1: "students and educators",
      r2: "audition monologues",
      r3: "monologue finder",
    },
    movie: {
      h1: "Movie monologues for auditions",
      intro:
        "Film monologues can be great for reels and contemporary calls when you want something recognizable. Search pieces pulled from real screenplays by tone, length, and character type, then rehearse them with ScenePartner.",
      b1: "Pieces drawn from real films, not invented scenes",
      b2: "Filter by tone, length, and character type",
      b3: "Rehearse with ScenePartner reading the other lines",
      r1: "ScenePartner",
      r2: "audition monologues",
      r3: "contemporary monologues",
    },
    shakespeareWomen: {
      h1: "Shakespeare monologues for women",
      intro:
        "Shakespeare shows up at most classical auditions, and the right speech can set you apart. Search monologues for women across the plays by character, tone, and length, from the well known to the rarely heard.",
      b1: "Pieces from across the comedies, tragedies, and histories",
      b2: "Filter by character, tone, and length",
      b3: "Overdone filter so you skip the speeches everyone brings",
      r1: "Shakespeare monologues",
      r2: "classical monologues",
      r3: "monologues for women",
    },
    classical: {
      title: "{em} monologues for auditions",
      titleEm: "Classical",
      lede:
        "From Shakespeare to other classic texts. Search by play, character type, or mood. Our database includes thousands of classical pieces, and the AI understands what you mean, not just the words you type.",
    },
    comedicWomanUnder2: {
      title: "{em} monologue for woman under 2 minutes",
      titleEm: "Comedic",
      lede:
        "One of the most common searches we see. ActorRise has thousands of comedic monologues for women, and you can filter by length, tone, and style. Or just describe what you need in plain English.",
    },
    dramaticContemporary: {
      title: "Dramatic monologue from a {em} play",
      titleEm: "contemporary",
      lede:
        "Looking for something serious, modern, and not overdone? We have thousands of dramatic monologues from contemporary plays. Search by emotion, relationship, or length. No keyword guessing.",
    },
  },
};
