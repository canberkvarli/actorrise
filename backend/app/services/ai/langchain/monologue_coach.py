"""
Monologue delivery coach.

Sibling to `audition_coach` but transcript-only (no video frames): it grades an
actor's spoken run of a monologue against the reference text. Used by the
monologue "work" flow (X). Text model, cheap — gpt-4o-mini.
"""

import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .config import get_llm

logger = logging.getLogger("uvicorn.error")


MONOLOGUE_COACH_SYSTEM = (
    "You are a warm, sharp acting coach helping an actor get a monologue off book "
    "and into their body. You are given the reference text of the monologue and a "
    "rough transcript of what the actor actually said out loud while running it. "
    "The transcript comes from speech recognition, so expect small word errors — "
    "judge intent and delivery, not typos. Give honest, encouraging, specific notes. "
    "Never invent lines that are not in the reference. Sound like a trusted scene "
    "partner, not a critic."
)


class MonologueDeliveryFeedback(BaseModel):
    rating: int = Field(description="Overall delivery rating, 1-5")
    overall_notes: str = Field(description="2-3 sentence warm overall assessment")
    line_accuracy: str = Field(
        description="How closely the spoken words matched the reference text, and where they drifted"
    )
    pacing: str = Field(description="Assessment of pacing and rhythm given the run's duration")
    emotional_tone: str = Field(description="Whether the emotional tone landed for this piece")
    tips: List[str] = Field(description="Exactly 3 short, actionable tips")


class MonologueCoach:
    def __init__(self):
        self.llm = get_llm(model="gpt-4o-mini", temperature=0.4)
        self.parser = JsonOutputParser(pydantic_object=MonologueDeliveryFeedback)

    def analyze_transcript(
        self,
        transcript: str,
        reference_text: str,
        title: Optional[str] = None,
        character_name: Optional[str] = None,
        tone: Optional[str] = None,
        primary_emotion: Optional[str] = None,
        duration_seconds: Optional[float] = None,
    ) -> Dict[str, Any]:
        spoken = (transcript or "").strip()
        if not spoken:
            return {
                "rating": 0,
                "overall_notes": (
                    "I didn't catch any spoken lines this run, so I can't give notes yet. "
                    "Try running it out loud with your mic on."
                ),
                "line_accuracy": "",
                "pacing": "",
                "emotional_tone": "",
                "tips": [],
            }

        meta_bits = []
        if title:
            meta_bits.append(f"Title: {title}")
        if character_name:
            meta_bits.append(f"Character: {character_name}")
        if tone:
            meta_bits.append(f"Intended tone: {tone}")
        if primary_emotion:
            meta_bits.append(f"Primary emotion: {primary_emotion}")
        if duration_seconds:
            meta_bits.append(f"Run duration: {int(duration_seconds)} seconds")
        meta = "\n".join(meta_bits)

        human = (
            f"{meta}\n\n"
            "REFERENCE TEXT (the monologue as written):\n"
            f'"""\n{reference_text}\n"""\n\n'
            "WHAT THE ACTOR SAID (speech-to-text transcript, may contain recognition errors):\n"
            f'"""\n{spoken}\n"""\n\n'
            "Assess their delivery. Return JSON only.\n"
            f"{self.parser.get_format_instructions()}"
        )

        messages = [
            SystemMessage(content=MONOLOGUE_COACH_SYSTEM),
            HumanMessage(content=human),
        ]
        response = self.llm.invoke(messages)
        feedback = self.parser.parse(response.content)
        return {
            "rating": feedback.get("rating", 3),
            "overall_notes": feedback.get("overall_notes", ""),
            "line_accuracy": feedback.get("line_accuracy", ""),
            "pacing": feedback.get("pacing", ""),
            "emotional_tone": feedback.get("emotional_tone", ""),
            "tips": feedback.get("tips", []),
        }


_instance: Optional[MonologueCoach] = None


def get_monologue_coach() -> MonologueCoach:
    global _instance
    if _instance is None:
        _instance = MonologueCoach()
    return _instance
