/**
 * English copy for the "content" area: the blog, the guides, the privacy
 * policy, the terms and the collection shelves. Top-level keys are
 * namespaces; prefix them with "content" so they stay unique across files.
 *
 * The English is byte-identical to what these pages printed before they were
 * translated. Quotes from plays and monologue titles stay English in every
 * language. {name} is a var or, through SeoT/ContentT, a server-rendered slot.
 */

/** Turkish copy for one collection in lib/monologueCollections.ts. `h1` is a
 *  template with an {em} slot for the italic word, so Turkish can move it. */
export type CollectionCopy = {
  title: string;
  em: string;
  h1: string;
  direction: string;
  intro: string;
  /** Keyed by monologue id: the "Turns when ..." line under a hand-picked piece. */
  picks?: Record<string, string>;
};

/** A guide video's title and description, keyed by YouTube id. */
export type GuideCopy = { title: string; description: string };

/** A blog post's title and excerpt, keyed by slug. */
export type PostCopy = { title: string; excerpt: string };

export const content = {
  /*
   * The English for these two lives in lib/monologueCollections.ts and the
   * guides page's GUIDES list (metadata, JSON-LD, the sitemap and tests read
   * it there). Only other languages fill them in; ContentT falls back to the
   * English it is handed.
   */
  contentCollections: {} as Record<string, CollectionCopy>,

  contentLegal: {
    trNotice:
      "This translation is for information only. The English version is the binding text.",
    backHome: "Back to home",
    contactPage: "Contact page",
  },

  contentBlog: {
    direction: "(from the wings.)",
    title: "Blog",
    lede:
      "Practical writing for actors on choosing monologues, prepping auditions, and rehearsing smarter. Written by an actor, not a marketing team.",
    meta: "{date} · {minutes} min read",
    readMore: "Read more",
    posts: {} as Record<string, PostCopy>,
  },

  contentOverdone: {
    direction: "(warhorse warning.)",
    title: "The most {em} audition monologues (and what to do instead)",
    titleEm: "overdone",
    meta: "{date} · {minutes} min read · by Canberk",
    p1:
      "I’m an actor, and I’ve sat in enough audition waiting rooms to hear the same monologues over and over. You can almost feel the room go a little flat when the reader recognizes the first line. This isn’t a definitive ranking. It’s the pieces I, and a lot of casting people, hear constantly, why they can quietly work against you, and what I’d do instead.",
    h2Why: "Why an overdone monologue works against you",
    whyBody:
      "A great monologue done well is never the problem. The problem is comparison. When casting has heard a speech fifty times, they aren’t meeting your choices fresh, they’re measuring you against every version they already know. You spend your ninety seconds climbing out of that hole instead of just being good. A lesser-known piece lets them watch you, not the material.",
    h2Tell: "How to tell if your monologue is overdone",
    tell1: "It’s one of the five most famous speeches in a play everyone has read.",
    tell2: "It went viral as a film or TV scene people quote.",
    tell3: "Your teacher assigned it to half the class.",
    tell4: "You picked it because it’s “a classic,” not because it fits you.",
    tellAfter: "None of these make a piece bad. They just mean you’re walking in with company.",
    h2Classical: "The classical pieces you’ll hear in every waiting room",
    classicalIntro:
      "Shakespeare and the classics get recycled the most, partly because they’re required and partly because they’re free. Commonly cited as overdone:",
    classical1: "“To be or not to be” from Hamlet",
    classical2: "“Tomorrow, and tomorrow, and tomorrow” from Macbeth",
    classical3: "The St. Crispin’s Day speech from Henry V",
    classical4: "Puck’s closing speech from A Midsummer Night’s Dream",
    classical5: "Juliet’s “Gallop apace” and the balcony speeches",
    classical6: "Lady Macbeth’s “Out, damned spot”",
    classicalAfter: "All extraordinary. All heard constantly.",
    h2Screen: "The film and TV monologues everyone memorizes",
    screenIntro:
      "Screen monologues feel fresh until you remember everyone watched the same movies. The ones that come up again and again:",
    screen1: "“You can’t handle the truth” from A Few Good Men",
    screen2: "The Ezekiel 25:17 speech from Pulp Fiction",
    screen3: "The park bench speech from Good Will Hunting",
    screen4: "“Greed is good” from Wall Street",
    screen5: "The “always be closing” speech from Glengarry Glen Ross",
    screenAfter: "Great writing, but casting has heard them in a hundred self tapes.",
    h2Instead: "What to do instead",
    insteadIntro:
      "Being fresh isn’t about being obscure for its own sake. It’s about walking in with something that fits you and lets casting actually see you. A few things that help:",
    tip1Title: "Use the Overdone filter.",
    tip1Body:
      "ActorRise flags pieces that get used constantly, so you can skip them on purpose. Start from the {link}.",
    tip1Link: "monologue finder",
    tip2Title: "Search by what fits you, not what’s famous.",
    tip2Body:
      "Describe your type, tone, and length, and let the search surface pieces you’d never find flipping through a “best of” list.",
    tip3Title: "Go one step less famous.",
    tip3Body: "The same playwright usually has three speeches nobody brings.",
    tip4Title: "Rehearse it until it’s yours.",
    tip4Body: "Run it out loud with {link} so the piece feels lived in, not recited.",
    outro:
      "Pick something that suits you and do it honestly, and it almost doesn’t matter what everyone else is bringing. That’s the whole game.",
    ctaFind: "Find a fresh monologue",
  },

  contentGuides: {
    direction: "(director's notes.)",
    title: "Guides & tutorials for {em}.",
    titleEm: "actors",
    lede:
      "Short videos on getting the most out of ActorRise, from finding the right monologue to rehearsing with ScenePartner. More are on the way.",
    tryIt: "Ready to try it yourself? Start from the {finder} or rehearse with {partner}.",
    finderLink: "monologue finder",
    play: "Play {title}",
    thumbnail: "{title} thumbnail",
    videos: {} as Record<string, GuideCopy>,
  },

  contentPrivacy: {
    direction: "(the fine print.)",
    title: "Privacy Policy",
    updated: "Last updated: October 29, 2026",
    s1Title: "1. Introduction",
    s1Body:
      "ActorRise (\"we,\" \"us,\" or \"our\") operates the website and platform at actorrise.com and our mobile applications, including Ghost Light: Monologues for iOS (together, the \"Service\"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By accessing or using the Service, you agree to this Privacy Policy. If you do not agree, please do not use the Service.",
    s2Title: "2. Information We Collect",
    s2Intro: "We collect information that you provide directly and information we obtain automatically:",
    s2AccountLabel: "Account information:",
    s2Account:
      "When you sign up (via email or third-party sign-in such as Google or Apple), we receive your email address and, if provided, your name. We do not store your password when you use third-party sign-in.",
    s2ProfileLabel: "Profile information:",
    s2Profile:
      "You may choose to provide name, age range, gender, ethnicity, height, build, location, experience level, actor type, training background, union status, preferred genres, and similar details to personalize recommendations and features.",
    s2HeadshotLabel: "Headshot and images:",
    s2Headshot:
      "If you upload a headshot or other images, we store and process them to provide the Service (e.g., display on your profile).",
    s2UsageLabel: "Usage and preferences:",
    s2Usage:
      "We collect data about how you use the Service (e.g., searches, bookmarks, feature usage) to operate, improve, and personalize the Service.",
    s2PaymentLabel: "Payment information:",
    s2Payment:
      "If you subscribe on the web, payment is processed by our payment provider (e.g., Stripe). If you subscribe inside our iOS app, payment is processed by Apple through in-app purchase. In neither case do we store your full card number; we receive and store only what is necessary for billing and support (e.g., last four digits or a receipt identifier, and billing email).",
    s2TechLabel: "Technical and device data:",
    s2Tech:
      "We may collect IP address, browser type, device type, and similar technical data for security, fraud prevention, and analytics.",
    s3Title: "3. How We Use Your Information",
    s3Intro: "We use the information we collect to:",
    s3i1: "Provide, maintain, and improve the Service.",
    s3i2: "Authenticate you and manage your account.",
    s3i3: "Personalize content and recommendations (e.g., monologue matches, AI-based features).",
    s3i4: "Process payments and manage subscriptions.",
    s3i5: "Send you service-related communications (e.g., account or billing notices).",
    s3i6: "Respond to your requests and support inquiries.",
    s3i7: "Detect, prevent, and address fraud, abuse, or security issues.",
    s3i8: "Comply with legal obligations and enforce our Terms of Service.",
    s3i9: "Analyze usage to improve the Service (including via aggregated or anonymized data).",
    s4Title: "4. Legal Basis for Processing (EEA/UK)",
    s4Body:
      "Where applicable under data protection laws (e.g., GDPR), we process your data on the basis of: (a) performance of our contract with you (providing the Service); (b) your consent where we ask for it (e.g., marketing); (c) our legitimate interests (e.g., security, analytics, improving the Service); and (d) compliance with legal obligations.",
    s5Title: "5. Third-Party Services and Sharing",
    s5Intro:
      "We use trusted third parties to operate the Service. They may process your data on our behalf under strict agreements:",
    s5AuthLabel: "Authentication and storage:",
    s5Auth: "Supabase (auth and cloud storage). Their privacy practices apply to data they process.",
    s5SignInLabel: "Sign-in providers:",
    s5SignIn:
      "If you sign in with Google or Apple, those providers share with us the information you consent to (e.g., email, name) in accordance with their policies.",
    s5WebPayLabel: "Payments on the web:",
    s5WebPay:
      "Stripe or another payment processor for subscriptions bought on actorrise.com. Payment data is handled by them; we do not store full payment card details.",
    s5IosPayLabel: "Payments in our iOS app:",
    s5IosPay:
      "Subscriptions bought inside Ghost Light: Monologues are processed by Apple through in-app purchase. Apple does not share your payment details with us. We use RevenueCat to record which subscription you hold and to keep it in sync across your devices; it receives a pseudonymous identifier for your account, your purchase and receipt history, and basic device and app-version data. We never receive your card number.",
    s5AiLabel: "AI providers:",
    s5Ai:
      "We use OpenAI to power search, recommendations, speech transcription, self-tape feedback, and script parsing. The scene partner’s voice is generated from the script text by OpenAI, Google (Gemini and Vertex AI) or Inworld; they receive the lines to be spoken, not who you are. Section 6 describes exactly what is sent, and what is kept. Under these providers’ API terms, content sent through their APIs is not used to train their models.",
    s5CueLabel: "Cue, the in-app assistant:",
    s5Cue:
      "What you type to Cue is sent to Anthropic to write Cue’s reply, under API terms that do not allow training on it. Your conversations with Cue are stored in your account, and Canberk reads them when Cue passes a question to him. Do not type anything into Cue you would not put in an email to us.",
    s5WebAnalyticsLabel: "Website analytics:",
    s5WebAnalytics:
      "actorrise.com uses Google Analytics to count visits, pages viewed and which features are used, with a pseudonymous identifier. It does not receive your email address or the words you search for.",
    s5AppAnalyticsLabel: "Product analytics in our iOS app:",
    s5AppAnalyticsA:
      "Ghost Light: Monologues uses PostHog so we can see which parts of the app earn their place and where people get stuck. It receives events describing what happened — that a search was run, that a monologue was opened, that the subscription screen appeared — together with a pseudonymous identifier, your device type and the app version.",
    s5AppAnalyticsB:
      "It does not receive the words you search for, and it does not receive the monologues you read.",
    s5AppAnalyticsC:
      "If you sign in, these events are associated with your account identifier and never with your email address.",
    s5FeedLabel: "Community feed (the callboard).",
    s5Feed:
      "ActorRise includes a community activity feed visible to other signed-in users. It can show your first name, city, and profile photo alongside activity such as joining, reading, saving, or rehearsing a particular monologue. It never shows the text of your searches: raw search queries are not stored in the feed at all, and a search appears only as a general description (for example, “searched for a comedic monologue”). You can turn this off at any time using “Hide my activity” on the callboard, which also hides your past activity, not just future activity. A logged-out preview of the feed shows only a first initial and no photo.",
    s5NoSell:
      "We do not sell your personal information. We may disclose your information if required by law, to protect our rights or safety, or in connection with a merger, sale, or transfer of assets (with notice where required).",
    s6Title: "6. Voice, Video, and Script Content",
    s6Intro:
      "Several features work by sending what you record or upload to our AI provider. This section sets out exactly what leaves your device, where it goes, and what is kept. If you never use these features, none of it applies to you.",
    s6VoiceLabel: "Your voice during rehearsal.",
    s6Voice:
      "When you rehearse a scene or monologue and speak your lines, short audio clips are captured by your browser or app and sent to our transcription provider (OpenAI Whisper) to be turned into text, so the scene partner knows when you have finished a line. The audio file is deleted as soon as the text comes back. We do not store your recordings, we do not keep them in our database, and no one at ActorRise listens to them.",
    s6PartnerLabel: "The scene partner’s voice.",
    s6Partner:
      "The other character’s lines are spoken using a synthetic voice generated from the script text by our provider. This is generated audio, not a recording of a person.",
    s6VideoLabel: "Self-tape video.",
    s6Video:
      "In Audition Mode, your video is recorded and stays on your device. Your device extracts a small number of still frames and sends only those frames to our AI provider to generate feedback on framing, lighting, and performance. The video file itself is never uploaded to us. The frames are not stored after the feedback is produced.",
    s6ScriptsLabel: "Scripts and sides you upload.",
    s6Scripts:
      "Scripts you upload are stored in your account so you can rehearse them again. To identify characters and split the dialogue, the text is sent to our AI provider for parsing. Your uploaded scripts are private to your account unless you choose to share one, and we do not add them to our public monologue library.",
    s6After:
      "Content sent to our AI provider through their API is not used to train their models. They may retain it briefly for abuse monitoring under their API terms. You can stop all microphone and camera processing at any time by declining or revoking the browser or device permission, or by not using these features; the rest of the Service continues to work without them.",
    s7Title: "7. Data Retention",
    s7Body:
      "We retain your data for as long as your account is active or as needed to provide the Service and fulfill the purposes described in this policy. We may retain certain data longer where required by law (e.g., tax, legal claims) or for legitimate business purposes (e.g., security, dispute resolution). After account deletion, we delete or anonymize your personal data within a reasonable period, except where retention is required by law.",
    s8Title: "8. Your Rights",
    s8Intro: "Depending on where you live, you may have the right to:",
    s8AccessLabel: "Access",
    s8Access: "{label} your personal data and receive a copy.",
    s8CorrectLabel: "Correct",
    s8Correct: "{label} inaccurate or incomplete data.",
    s8DeleteLabel: "Delete",
    s8Delete: "{label} your data (subject to legal exceptions).",
    s8RestrictLabel: "Restrict or object",
    s8Restrict: "{label} to certain processing.",
    s8PortLabel: "Data portability",
    s8Port: "{label} (receive your data in a structured, machine-readable format).",
    s8WithdrawLabel: "Withdraw consent",
    s8Withdraw: "{label} where processing is based on consent.",
    s8ComplainLabel: "Lodge a complaint",
    s8Complain: "{label} with a supervisory authority (e.g., in your country or region).",
    s8After:
      "To exercise these rights, contact us at the email below. You can also update or delete your account and profile from within the Service where we provide those options.",
    s9Title: "9. International Transfers",
    s9Body:
      "Your data may be processed in countries other than your own. We ensure appropriate safeguards (e.g., standard contractual clauses, adequacy decisions) where required by law so that your data remains protected in line with this policy and applicable regulations.",
    s10Title: "10. Security",
    s10Body:
      "We implement technical and organizational measures to protect your data against unauthorized access, loss, or alteration. No method of transmission or storage is 100% secure; we cannot guarantee absolute security and you use the Service at your own risk in that regard.",
    s11Title: "11. Ages",
    s11Body:
      "ActorRise is for people aged 13 and older. Students aged 13 to 17 use it through their school or acting class, with their teacher. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has an account, contact us and we will delete it promptly.",
    s12Title: "12. Schools, Teachers and Students",
    s12Intro: "When a teacher brings a class to ActorRise through a class link:",
    s12GivesLabel: "What a student gives us:",
    s12Gives:
      "the email they sign up with (usually their school address), their name if their sign-in provides it, and what they do in the Service: searches, saved pieces and rehearsals.",
    s12TeacherLabel: "What the teacher sees:",
    s12TeacherA:
      "for each student who joined their class, the student’s name, when they joined and were last active, and counts of what they did (how many searches, monologues and scenes).",
    s12TeacherB: "The teacher never sees what a student searched for.",
    s12OthersLabel: "What other users see:",
    s12Others: "nothing. Students never appear in the community feed.",
    s12EmailLabel: "Email:",
    s12Email:
      "students who join through a class link are left out of our marketing emails, and a student on a school district address gets no automated reminders either. They still receive emails they need, such as a sign-in link.",
    s12NoSellLabel: "No selling, no ads:",
    s12NoSell:
      "we do not sell student data, show ads, or use it for anything but running the Service and improving it.",
    s12DeleteLabel: "Deletion:",
    s12Delete:
      "a teacher or school can ask us to delete their students’ accounts and data at any time by emailing canberk@actorrise.com, and a student can delete their own account in Settings.",
    s13Title: "13. Changes to This Policy",
    s13Body:
      "We may update this Privacy Policy from time to time. We will post the updated policy on this page and, for material changes, we will provide additional notice (e.g., email or in-product notice) where required by law. Your continued use of the Service after the effective date of changes constitutes acceptance of the updated policy.",
    s14Title: "14. Contact",
    s14Body:
      "For privacy-related questions, requests, or complaints, contact us at: {link} or by email at the address listed there. We will respond in accordance with applicable law.",
    termsLink: "Terms of Service",
  },

  contentTerms: {
    direction: "(the house rules.)",
    title: "Terms of Service",
    updated: "Last updated: August 2026",
    s1Title: "1. Acceptance of Terms",
    s1Body:
      "These Terms of Service (\"Terms\") are a binding agreement between you and ActorRise (\"we,\" \"us,\" or \"our\") governing your access to and use of the website and platform at actorrise.com, our mobile applications including Ghost Light: Monologues for iOS, and related services (together, the \"Service\"). By creating an account, signing in, or otherwise using the Service, you agree to these Terms and our Privacy Policy. If you do not agree, you must not use the Service.",
    s2Title: "2. Description of the Service",
    s2Body:
      "ActorRise provides tools for actors, including monologue search and discovery, profile management, AI-powered recommendations, scene partner and coaching features, and related content and functionality. We may add, change, or discontinue features at any time. The Service is provided \"as is\" subject to the disclaimers and limitations in these Terms.",
    s3Title: "3. Eligibility and Account",
    s3Body:
      "You must be at least 16 years old (or the age of majority in your jurisdiction, if higher) and able to form a binding contract to use the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. You must provide accurate and complete information and update it as needed. We may suspend or terminate your account if you breach these Terms or for other reasons we deem necessary.",
    s4Title: "4. Acceptable Use",
    s4Intro: "You agree not to:",
    s4i1: "Use the Service for any illegal purpose or in violation of any applicable laws.",
    s4i2: "Infringe any third party's intellectual property, privacy, or other rights.",
    s4i3: "Upload or share content that is defamatory, harassing, abusive, obscene, or otherwise objectionable.",
    s4i4: "Attempt to gain unauthorized access to the Service, other accounts, or our or our providers' systems or data.",
    s4i5: "Use automated means (e.g., scrapers, bots) to access the Service except where we expressly allow it.",
    s4i6: "Resell, sublicense, or commercially exploit the Service or content except as we expressly permit.",
    s4i7: "Circumvent any usage limits, security measures, or access controls.",
    s4After:
      "We may remove content and suspend or terminate accounts that violate these rules. We are not obligated to monitor all content but may do so at our discretion.",
    s5Title: "5. Subscriptions and Payment",
    s5p1:
      "Some parts of the Service may require a paid subscription. By subscribing, you agree to pay the fees stated at the time of purchase (e.g., monthly or annual). Fees are charged in advance and are generally non-refundable except as required by law or as we explicitly state (e.g., in a refund policy on the pricing or checkout page). Payment is processed by our payment provider (e.g., Stripe); their terms apply to the payment transaction. You are responsible for any taxes that apply to your purchase.",
    s5p2:
      "You may cancel your subscription in accordance with the options we provide (e.g., in account or billing settings). Cancellation will stop future charges; you will retain access until the end of the current billing period. We may change subscription fees with reasonable notice; continued use after the change constitutes acceptance.",
    s5AppleTitle: "Subscriptions purchased through Apple",
    s5p3:
      "Subscriptions bought inside Ghost Light: Monologues on iOS are sold and processed by Apple through in-app purchase, not by Stripe. Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically for the same period at the same price unless auto-renew is turned off at least 24 hours before the end of the current period, and your Apple Account is charged for renewal within 24 hours before that period ends.",
    s5p4:
      "Manage or cancel an Apple subscription in Settings on your device, under your Apple Account, Subscriptions. Cancelling stops future renewals; access continues until the end of the period you have already paid for. Deleting the app does not cancel a subscription.",
    s5p5:
      "Where a free trial is offered, any unused portion of that trial is forfeited if you buy a subscription before the trial ends. Refunds for Apple purchases are handled by Apple under its own terms, not by us; request one at reportaproblem.apple.com.",
    s6Title: "6. Intellectual Property and Content",
    s6OursLabel: "Our content and IP:",
    s6Ours:
      "The Service (including design, text, graphics, code, and other materials we provide) and our name and branding are owned by us or our licensors and are protected by copyright and other laws. You may not copy, modify, distribute, or create derivative works from our content or IP except as we expressly allow.",
    s6ScriptsLabel: "Monologues and scripts:",
    s6Scripts:
      "Monologue and script content we make available is provided for discovery with attribution and links back to its source and original publication. Your use of that content is subject to applicable copyright and our display terms. We do not grant you rights to use third-party copyrighted works beyond what the applicable license allows; see our {link} page for more information.",
    s6SourcesLink: "Sources & copyright",
    s6FilmLabel: "Film and television reference:",
    s6Film:
      "Film and television reference entries contain only factual metadata (character name, source title, thematic descriptions, and links) and do not include copyrighted script text. Links to third-party script sources are provided for convenience only; ActorRise is not responsible for third-party content.",
    s6YoursLabel: "Your content:",
    s6Yours:
      "You retain ownership of content you upload (e.g., headshots, profile text). You grant us a non-exclusive, royalty-free, worldwide license to use, store, display, and process that content as needed to provide and improve the Service and as described in our Privacy Policy. You represent that you have the rights to grant this license and that your content does not violate these Terms or any third-party rights.",
    s7Title: "7. Disclaimers",
    s7Caps:
      "THE SERVICE IS PROVIDED \"AS IS\" AND \"AS AVAILABLE\" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.",
    s7i1: "We do not guarantee that the Service will be uninterrupted, error-free, or secure.",
    s7i2:
      "We are not a talent agency, employer, or casting service. The Service does not create an employment or agency relationship. We do not guarantee auditions, roles, or career outcomes.",
    s7i3:
      "AI-generated or AI-assisted features (e.g., recommendations, feedback) are for informational and creative support only and do not constitute professional, legal, or career advice.",
    s7i4: "You use the Service and any content or recommendations at your own risk.",
    s8Title: "8. Limitation of Liability",
    s8p1:
      "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ACTORRISE, ITS AFFILIATES, OR THEIR RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES (INCLUDING LOSS OF PROFITS, DATA, OR GOODWILL) ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.",
    s8p2:
      "OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE, OR (B) ONE HUNDRED U.S. DOLLARS (USD $100). SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES; IN SUCH CASES, THE ABOVE LIMITATIONS MAY NOT APPLY TO YOU TO THAT EXTENT.",
    s9Title: "9. Indemnification",
    s9Body:
      "You agree to indemnify, defend, and hold harmless ActorRise and its affiliates, officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to (a) your use of the Service, (b) your content or conduct, (c) your violation of these Terms or any law, or (d) your violation of any third-party rights. We reserve the right to assume exclusive defense and control of any matter subject to indemnification by you; you will cooperate with us in that defense.",
    s10Title: "10. Termination",
    s10Body:
      "You may stop using the Service and close your account at any time. We may suspend or terminate your access to the Service, with or without notice, for any reason, including breach of these Terms. Upon termination, your right to use the Service ceases. Provisions that by their nature should survive (including disclaimers, limitation of liability, indemnification, and governing law) will survive termination.",
    s11Title: "11. Disputes and Governing Law",
    s11Body:
      "These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles. Any dispute arising from or related to these Terms or the Service shall be resolved exclusively in the state or federal courts located in Delaware, and you consent to personal jurisdiction there. You waive any right to a jury trial and any right to participate in a class or representative action to the extent permitted by applicable law.",
    s12Title: "12. General",
    s12p1:
      "These Terms, together with our Privacy Policy and any other policies we reference, constitute the entire agreement between you and ActorRise regarding the Service. Our failure to enforce any right or provision does not waive that right or provision. If any provision is held invalid or unenforceable, the remaining provisions remain in effect. We may assign our rights and obligations under these Terms; you may not assign without our prior written consent.",
    s12p2:
      "We may modify these Terms at any time. We will post the updated Terms on this page and update the \"Last updated\" date. Material changes may be communicated via email or in-product notice where required. Your continued use of the Service after the effective date of changes constitutes acceptance of the revised Terms.",
    s13Title: "13. Contact",
    s13Body: "For questions about these Terms, please contact us via our {link}.",
    s14Title: "14. DMCA Notice",
    s14Body:
      "If you believe content on ActorRise infringes your copyright, contact us at {email} with: (1) identification of the copyrighted work; (2) identification of the allegedly infringing material and its URL; (3) your contact information; (4) a statement of good faith belief that the use is not authorized by the copyright owner; and (5) your electronic or physical signature. We will investigate and remove infringing content where appropriate.",
    privacyLink: "Privacy Policy",
  },
};
