/**
 * Mock monologue data for the iOS app prototype — replaced by real backend
 * results when @actorrise/api-client gets a searchMonologues method in
 * Phase 2 (Task 2.2).
 */
export interface MockMonologue {
  id: string;
  character: string;
  source: string;
  sourceYear?: number;
  preview: string;
  wordCount: number;
  genre: 'drama' | 'comedy' | 'classical';
  gender: 'female' | 'male' | 'any';
  ageRange: string;
}

export const MOCK_MONOLOGUES: MockMonologue[] = [
  {
    id: 'm1',
    character: 'Beatrice',
    source: 'Much Ado About Nothing',
    sourceYear: 1599,
    preview:
      'Is he not approved in the height a villain, that hath slandered, scorned, dishonored my kinswoman?',
    wordCount: 142,
    genre: 'classical',
    gender: 'female',
    ageRange: '20s–30s',
  },
  {
    id: 'm2',
    character: 'Lou Lumenick',
    source: 'The Social Network',
    sourceYear: 2010,
    preview:
      "You know, when you go fishing you can catch a lot of fish. But you can also catch a whale. If you tip the boat over, you'll lose everything.",
    wordCount: 198,
    genre: 'drama',
    gender: 'male',
    ageRange: '20s',
  },
  {
    id: 'm3',
    character: 'Hedda',
    source: 'Hedda Gabler',
    sourceYear: 1891,
    preview:
      "I often think there is only one thing in the world that I have any real talent for. Just one. Boring myself to death.",
    wordCount: 87,
    genre: 'drama',
    gender: 'female',
    ageRange: '30s',
  },
  {
    id: 'm4',
    character: 'Frank',
    source: 'Glengarry Glen Ross',
    sourceYear: 1992,
    preview:
      "Put. That coffee. Down. Coffee is for closers only. You think I'm fucking with you? I am not fucking with you.",
    wordCount: 215,
    genre: 'drama',
    gender: 'male',
    ageRange: '40s–50s',
  },
  {
    id: 'm5',
    character: 'Viola',
    source: 'Twelfth Night',
    sourceYear: 1602,
    preview:
      "I left no ring with her. What means this lady? Fortune forbid my outside have not charmed her!",
    wordCount: 134,
    genre: 'classical',
    gender: 'female',
    ageRange: '20s',
  },
];
