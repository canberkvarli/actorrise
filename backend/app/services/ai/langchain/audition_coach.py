"""
Audition Coach - AI Casting Director Feedback with Vision

Uses GPT-4o Vision to analyze actual video frames from self-tape recordings.
Provides real feedback based on what's visible: framing, lighting, body language,
eye contact, energy, and whether the actor is actually performing.
"""

import base64
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field

from .config import get_llm

logger = logging.getLogger("uvicorn.error")

CASTING_DIRECTOR_SYSTEM = """You are a professional casting director with 20+ years of experience evaluating self-tape auditions.

You are reviewing actual video frames from a self-tape recording. Analyze EXACTLY what you see — do not invent or assume anything that isn't visible in the frames.

Your job:
1. Look at the frames and describe what is ACTUALLY happening (is the person performing? reading? just sitting there?)
2. Evaluate framing, lighting, background, and camera setup based on what you see
3. Assess body language, facial expressions, energy, and presence from the visible frames
4. If monologue text is provided, comment on whether the performance appears to match the material
5. Be honest — if the person isn't performing or the tape has issues, say so constructively

CRITICAL RULES:
- ONLY comment on what you can actually see in the frames
- If the person is clearly not performing (eating, looking at phone, etc.), note that honestly but kindly
- Do not fabricate line accuracy or emotional beats you cannot observe
- If frames are dark, blurry, or unusable, say so
- Be encouraging but never dishonest

Rate on a 1-5 scale:
1 = Not a performance / unusable tape
2 = Significant issues with setup or performance
3 = Decent effort with clear areas to improve
4 = Strong tape with minor adjustments needed
5 = Excellent, submission-ready tape

Respond in JSON format with this exact structure:
{
  "rating": <1-5>,
  "summary": "<2-3 sentence overall assessment of what you observed>",
  "framing_and_setup": "<assessment of camera framing, lighting, background, audio setup based on what's visible>",
  "performance": "<assessment of what the actor is doing — body language, expressions, energy, presence. Be honest about whether they appear to be performing.>",
  "pacing_and_delivery": "<if they appear to be performing, comment on pacing and delivery. If not performing, note that.>",
  "tips": ["<specific, actionable tip based on what you see>", "<another tip>", "<another tip>"]
}"""


class VisionAuditionFeedback(BaseModel):
    """Structured feedback from vision-based analysis"""
    rating: int = Field(description="Overall rating 1-5")
    summary: str = Field(description="2-3 sentence overall assessment")
    framing_and_setup: str = Field(description="Camera, lighting, background assessment")
    performance: str = Field(description="Body language, expressions, energy")
    pacing_and_delivery: str = Field(description="Pacing and delivery assessment")
    tips: List[str] = Field(description="3 actionable tips")


class AuditionCoach:
    """AI Casting Director that analyzes actual video frames"""

    def __init__(self):
        # GPT-4o for vision capabilities
        self.vision_llm = get_llm(model="gpt-4o", temperature=0.4)
        self.parser = JsonOutputParser(pydantic_object=VisionAuditionFeedback)

    def analyze_with_frames(
        self,
        frames_base64: List[str],
        duration: int,
        monologue_title: Optional[str] = None,
        monologue_text: Optional[str] = None,
        character_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze self-tape using actual video frames.

        Args:
            frames_base64: List of base64-encoded JPEG frames from the video
            duration: Recording duration in seconds
            monologue_title: Optional title of the monologue
            monologue_text: Optional text being performed
            character_name: Optional character name
        """
        if not frames_base64:
            raise ValueError("No frames provided for analysis")

        # Build context about the material (if provided)
        material_context = ""
        if monologue_title or monologue_text:
            material_context = "\n\nMATERIAL CONTEXT:"
            if monologue_title:
                material_context += f"\nTitle: {monologue_title}"
            if character_name:
                material_context += f"\nCharacter: {character_name}"
            if monologue_text:
                material_context += f"\nText (first 300 chars): {monologue_text[:300]}"

        # Build the multimodal message with frames
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    f"Please analyze this self-tape audition. "
                    f"Recording duration: {duration} seconds. "
                    f"I'm showing you {len(frames_base64)} frames sampled evenly across the recording."
                    f"{material_context}\n\n"
                    f"Look at each frame carefully and provide honest, constructive feedback "
                    f"based on what you ACTUALLY see."
                ),
            }
        ]

        # Add each frame as an image
        for i, frame_b64 in enumerate(frames_base64):
            # Strip data URL prefix if present
            if "," in frame_b64:
                frame_b64 = frame_b64.split(",", 1)[1]

            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{frame_b64}",
                    "detail": "low",  # Low detail = cheaper, still good for framing/lighting
                },
            })

        messages = [
            SystemMessage(content=CASTING_DIRECTOR_SYSTEM),
            HumanMessage(content=content),
        ]

        try:
            response = self.vision_llm.invoke(messages)
            # Parse the JSON response
            feedback = self.parser.parse(response.content)

            # Normalize to API response format
            return {
                "rating": feedback.get("rating", 3),
                "strengths": [],  # Extracted from summary by frontend if needed
                "areas_for_improvement": [],
                "overall_notes": feedback.get("summary", ""),
                "line_accuracy": feedback.get("pacing_and_delivery", ""),
                "pacing": feedback.get("pacing_and_delivery", ""),
                "emotional_tone": feedback.get("performance", ""),
                "framing": feedback.get("framing_and_setup", ""),
                "tips": feedback.get("tips", []),
            }

        except Exception as e:
            logger.exception("Vision analysis failed: %s", e)
            raise


def get_audition_coach() -> AuditionCoach:
    """Get singleton instance of audition coach"""
    if not hasattr(get_audition_coach, '_instance'):
        get_audition_coach._instance = AuditionCoach()
    return get_audition_coach._instance
