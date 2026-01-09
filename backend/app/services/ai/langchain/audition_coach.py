"""
Audition Coach - AI Casting Director Feedback
Uses LangChain to provide professional audition feedback
"""

from typing import Dict, List, Any
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .config import get_llm


class AuditionFeedback(BaseModel):
    """Structured feedback from AI casting director"""
    rating: int = Field(description="Overall rating from 1-5 stars")
    strengths: List[str] = Field(description="What the actor did well (3-4 points)")
    areas_for_improvement: List[str] = Field(description="What could be improved (2-3 points)")
    overall_notes: str = Field(description="Brief overall assessment (2-3 sentences)")


class AuditionCoach:
    """AI Casting Director that provides professional feedback on auditions"""

    def __init__(self):
        self.llm = get_llm(model="gpt-4o-mini", temperature=0.7)
        self.parser = JsonOutputParser(pydantic_object=AuditionFeedback)

        self.feedback_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a professional casting director with 20+ years of experience evaluating auditions.
Your role is to provide constructive, encouraging, and actionable feedback to help actors improve their craft.

You should evaluate:
- Character interpretation and understanding
- Emotional depth and authenticity
- Voice projection and clarity
- Physical presence and body language
- Pacing and timing
- Connection to material
- Overall professionalism

Be specific, constructive, and encouraging. Always find genuine strengths to praise.
Balance positive feedback with areas for growth. Use industry-standard terminology.

{format_instructions}"""),
            ("human", """Please provide casting director feedback for this audition:

**Monologue Information:**
Title: {monologue_title}
Character: {character_name}
Play: {play_title}
Genre: {genre}

**Monologue Text:**
{monologue_text}

**Performance Details:**
Duration: {duration} seconds
Expected duration: ~{expected_duration} seconds

**Analysis Focus:**
- Did the actor choose appropriate pacing?
- Was the duration appropriate for the material?
- What can you infer about their interpretation?

Provide professional, constructive feedback as if you were a casting director reviewing this audition tape.""")
        ])

    def analyze_audition(
        self,
        monologue_title: str,
        character_name: str,
        play_title: str,
        monologue_text: str,
        duration: int,
        genre: str = "Drama"
    ) -> Dict[str, Any]:
        """
        Analyze an audition and provide casting director feedback

        Args:
            monologue_title: Title of the monologue
            character_name: Character being performed
            play_title: Play the monologue is from
            monologue_text: Full text of the monologue
            duration: How long the performance was (seconds)
            genre: Genre of the piece

        Returns:
            Structured feedback dictionary
        """
        # Estimate expected duration (rough: 150 words per minute)
        word_count = len(monologue_text.split())
        expected_duration = int((word_count / 150) * 60)

        # Prepare the chain
        chain = self.feedback_prompt | self.llm | self.parser

        # Generate feedback
        try:
            feedback = chain.invoke({
                "monologue_title": monologue_title,
                "character_name": character_name,
                "play_title": play_title,
                "monologue_text": monologue_text[:500],  # First 500 chars for context
                "duration": duration,
                "expected_duration": expected_duration,
                "genre": genre,
                "format_instructions": self.parser.get_format_instructions()
            })

            return feedback

        except Exception as e:
            # Fallback feedback if AI fails
            return {
                "rating": 3,
                "strengths": [
                    "You completed the full performance",
                    "Good commitment to the material",
                    "Clear energy throughout"
                ],
                "areas_for_improvement": [
                    "Continue exploring different character choices",
                    "Experiment with varied pacing and tempo"
                ],
                "overall_notes": "Keep practicing and exploring this material. Every take helps you discover new layers in the character. You're on the right track!"
            }


def get_audition_coach() -> AuditionCoach:
    """Get singleton instance of audition coach"""
    if not hasattr(get_audition_coach, '_instance'):
        get_audition_coach._instance = AuditionCoach()
    return get_audition_coach._instance
