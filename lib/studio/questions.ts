/**
 * The questions an actor asks of a role, in our own words.
 *
 * The questions themselves come from the teachers named in `from`; the
 * wording, the "why" and the nudges are ours. Do not paste book text here.
 * Plain data, no React, so Ghost Light can use it as-is.
 */

export type QuestionId =
  | "who"
  | "where"
  | "when"
  | "before"
  | "want"
  | "why"
  | "obstacle"
  | "doing"
  | "partner"
  | "place"
  | "body";

export type Question = {
  id: QuestionId;
  group: "The world" | "The want" | "The people" | "The body";
  ask: string;
  /** Whose question it is. Shown as a small credit. */
  from: string;
  /** One line on why it matters. */
  why: string;
  /** Follow-ups that get you closer than the first answer. */
  nudges: string[];
  /** This one is answered in the cube, by pinning moments. */
  inCube?: boolean;
};

export const QUESTIONS: readonly Question[] = [
  {
    id: "who",
    group: "The world",
    ask: "Who am I?",
    from: "Hagen",
    why: "Not a summary of the character. What you know about yourself, in the first person.",
    nudges: [
      "What would people who love you say about you? People who don't?",
      "What do you never say out loud about yourself?",
      "What did you want to be at twelve?",
    ],
  },
  {
    id: "where",
    group: "The world",
    ask: "Where am I, and what surrounds me?",
    from: "Hagen, Stanislavski",
    why: "A place you could walk through with your eyes closed changes how you stand in it.",
    nudges: [
      "What is underfoot? What is the air like?",
      "What is just behind you, where the audience can't see?",
      "Is this place yours, or someone else's?",
    ],
  },
  {
    id: "when",
    group: "The world",
    ask: "What time is it?",
    from: "Hagen",
    why: "The hour, the season, the year, the moment in your life. Each one sits in the body.",
    nudges: ["How long have you been awake?", "What is about to happen tonight, or tomorrow?"],
  },
  {
    id: "before",
    group: "The world",
    ask: "What just happened?",
    from: "Hagen, Chubbuck, Meisner",
    why: "You don't start at your first line. You arrive full of the minute before.",
    nudges: [
      "Where were you ten minutes ago, and what did you hear there?",
      "What did you decide on the way in?",
    ],
  },
  {
    id: "want",
    group: "The want",
    ask: "What do I want?",
    from: "Stanislavski, Hagen, Chubbuck",
    why: "Something you could get from the other person in this scene, said as something you can do.",
    nudges: [
      "Say it as a verb aimed at them: to make him..., to get her to...",
      "How would you know, in this scene, that you got it?",
      "And under that: what do you want from your whole life?",
    ],
  },
  {
    id: "why",
    group: "The want",
    ask: "Why do I need it now?",
    from: "Adler, Moss",
    why: "The want needs a reason strong enough that waiting until tomorrow is impossible.",
    nudges: ["What happens to you if you don't get it today?", "What would it cost you to give up?"],
  },
  {
    id: "obstacle",
    group: "The want",
    ask: "What's in my way?",
    from: "Hagen, Chubbuck",
    why: "The obstacle is where the scene lives. Outside you, inside you, or both.",
    nudges: ["What is the person in front of you doing to stop you?", "What in you is stopping you?"],
  },
  {
    id: "doing",
    group: "The want",
    ask: "What do I do to get it?",
    from: "Hagen, Stanislavski",
    why: "Actions you play on the other person, and how they change when one stops working.",
    nudges: ["List three different things you try, in order.", "When do you change tactics, and why?"],
  },
  {
    id: "partner",
    group: "The people",
    ask: "Who is this person to me?",
    from: "Hagen, Meisner",
    why: "Your history with them, and what they are to you right now, in this scene.",
    nudges: [
      "Who in your own life could stand in for them?",
      "What do you never say to them?",
      "What do they have that you need?",
    ],
  },
  {
    id: "place",
    group: "The people",
    ask: "What does this place mean to me?",
    from: "Hagen, Chubbuck",
    why: "The play's place, seen through a place of your own that carries the same weight.",
    nudges: [
      "Is there a real place in your life that feels like this one?",
      "What one object in it would you not be able to look at?",
    ],
  },
  {
    id: "body",
    group: "The body",
    ask: "How do I move when I want it?",
    from: "Laban, Malmgren, Chekhov",
    why: "Weight, space and time. Pin where you are in the cube at each moment of the scene.",
    nudges: [
      "Where are you at your first line? At your last?",
      "Where does the scene push you that you'd rather not go?",
    ],
    inCube: true,
  },
];

export const GROUPS = ["The world", "The want", "The people", "The body"] as const;
