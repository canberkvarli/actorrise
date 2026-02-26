"""
LangGraph-powered AI Scene Partner for rehearsal sessions.

This module provides conversational AI scene partner functionality where:
1. AI plays one character in a two-person scene
2. Responds to user's line deliveries
3. Provides real-time coaching and feedback
4. Maintains character throughout the scene
"""

import json
import logging
from typing import Dict, List, TypedDict, Optional, Literal
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from app.services.ai.langchain.config import get_llm

logger = logging.getLogger(__name__)


# ============================================================================
# State Management
# ============================================================================

class ScenePartnerState(TypedDict):
    """State for scene rehearsal session"""
    # Scene Context
    scene_title: str
    play_title: str
    playwright: str
    setting: str
    relationship_dynamic: str
    tone: str
    primary_emotions: List[str]

    # Characters
    user_character: str
    ai_character: str
    user_character_description: str
    ai_character_description: str

    # Script — each line: {"character", "text", "order", "stage_direction", "primary_emotion"}
    all_lines: List[Dict]
    current_line_index: int

    # Conversation
    messages: List[Dict]
    dialogue_history: List[Dict]

    # Feedback
    feedback_notes: List[str]
    strengths: List[str]
    areas_to_improve: List[str]

    # Status
    mode: Literal["rehearsing", "coaching", "completed"]
    should_continue: bool


# ============================================================================
# Prompt Templates
# ============================================================================

SCENE_PARTNER_SYSTEM = """You are an AI acting coach and scene partner for {user_character} in "{scene_title}" from {play_title} by {playwright}.

**YOUR ROLE:**
- You are playing {ai_character}
- Stay in character when delivering lines
- Respond naturally to the user's delivery
- Provide supportive, constructive feedback

**SCENE CONTEXT:**
Setting: {setting}
Relationship: {relationship_dynamic}
Tone: {tone}
Emotions in this scene: {primary_emotions}

**{ai_character} DESCRIPTION:**
{ai_character_description}

**{user_character} DESCRIPTION:**
{user_character_description}

**CURRENT LINE:**
The user should say: "{expected_line}"
{stage_direction_context}

**YOUR NEXT LINE (the script says):**
{your_next_line}
{ai_stage_direction_context}

Respond with ONLY valid JSON (no markdown, no code fences) in this exact format:
{{
  "feedback": "One sentence of brief, encouraging feedback on the user's delivery.",
  "line_text": "Your scripted line delivered exactly as written. Do NOT add, remove, or rephrase the scripted words.",
  "tts_instructions": "Natural language description of how to deliver this line vocally."
}}

For tts_instructions, consider the scene's setting, tone ({tone}), relationship ({relationship_dynamic}), emotions ({primary_emotions}), and any stage directions. Describe vocal qualities: pace (slow/fast), volume (whisper/loud), emotional color (warm/cold/urgent/playful), and specific acting choices for this moment.

Example tts_instructions: "Deliver with quiet intensity and barely contained anger. Speak slowly, each word deliberate. Lower register, almost a whisper that rises at the end."

If the user significantly deviated from script, note this in feedback and still deliver your line."""


COACHING_FEEDBACK_SYSTEM = """You are an expert acting coach providing performance feedback.

The user just completed rehearsing a scene from "{scene_title}" ({play_title}).

**SCENE CONTEXT:**
- User played: {user_character}
- Setting: {setting}
- Relationship: {relationship_dynamic}

**YOUR TASK:**
Provide warm, constructive feedback on their performance.

**FEEDBACK STRUCTURE:**
1. **Strengths** - What they did well (2-3 specific observations)
2. **Growth Areas** - What to work on (1-2 gentle suggestions)
3. **Overall Assessment** - Brief encouraging summary

**TONE:**
- Supportive and encouraging
- Specific and actionable
- Balanced (acknowledge strengths before suggestions)
- Professional but warm

**DIALOGUE HISTORY:**
{dialogue_history}

**NOTES FROM REHEARSAL:**
{feedback_notes}"""


# ============================================================================
# Scene Partner Graph
# ============================================================================

class ScenePartnerGraph:
    """LangGraph-powered scene partner for rehearsal"""

    def __init__(self, temperature: float = 0.7):
        """
        Initialize scene partner graph.

        Args:
            temperature: LLM temperature (higher = more creative responses)
        """
        self.llm = get_llm(temperature=temperature)
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        """Build the LangGraph conversation flow"""
        workflow = StateGraph(ScenePartnerState)

        # Add nodes
        workflow.add_node("present_line", self._present_line)
        workflow.add_node("receive_delivery", self._receive_delivery)
        workflow.add_node("respond_as_character", self._respond_as_character)
        workflow.add_node("provide_coaching", self._provide_coaching)
        workflow.add_node("complete_session", self._complete_session)

        # Define edges
        workflow.set_entry_point("present_line")

        workflow.add_edge("present_line", "receive_delivery")
        workflow.add_edge("receive_delivery", "respond_as_character")

        # After responding, check if scene is complete
        workflow.add_conditional_edges(
            "respond_as_character",
            self._should_continue_scene,
            {
                "continue": "present_line",
                "coach": "provide_coaching",
                "end": "complete_session"
            }
        )

        workflow.add_edge("provide_coaching", "complete_session")
        workflow.add_edge("complete_session", END)

        return workflow.compile()

    def _present_line(self, state: ScenePartnerState) -> ScenePartnerState:
        """Present the next line for the user to deliver"""
        current_idx = state["current_line_index"]
        all_lines = state["all_lines"]

        if current_idx >= len(all_lines):
            state["mode"] = "completed"
            return state

        current_line = all_lines[current_idx]

        # If this is a line for the user's character, prompt them
        if current_line["character"] == state["user_character"]:
            state["messages"].append({
                "type": "system",
                "content": f"**{current_line['character']}:** [Your line: \"{current_line['text']}\"]"
            })

        return state

    def _receive_delivery(self, state: ScenePartnerState) -> ScenePartnerState:
        """Receive and process the user's line delivery"""
        # This will be called when user submits their line via API
        # For now, just mark as received
        return state

    def _respond_as_character(self, state: ScenePartnerState) -> ScenePartnerState:
        """AI delivers their line as the scene partner character (structured JSON output)."""
        current_idx = state["current_line_index"]
        all_lines = state["all_lines"]

        # Find the AI's next line
        ai_line = None
        for i in range(current_idx + 1, len(all_lines)):
            if all_lines[i]["character"] == state["ai_character"]:
                ai_line = all_lines[i]
                state["current_line_index"] = i
                break

        if not ai_line:
            state["mode"] = "completed"
            return state

        # Get the user's last delivery
        user_delivery = state.get("last_user_input", "")
        expected_line = all_lines[current_idx]["text"]

        # Build stage direction context
        user_stage_dir = all_lines[current_idx].get("stage_direction", "")
        ai_stage_dir = ai_line.get("stage_direction", "")
        stage_direction_context = f"Stage direction: [{user_stage_dir}]" if user_stage_dir else ""
        ai_stage_direction_context = f"Stage direction: [{ai_stage_dir}]" if ai_stage_dir else ""

        # Format emotions list
        emotions = state.get("primary_emotions", [])
        emotions_str = ", ".join(emotions) if emotions else "not specified"

        # Use JSON-format LLM for structured output
        json_llm = get_llm(temperature=0.7, use_json_format=True)

        prompt = ChatPromptTemplate.from_messages([
            ("system", SCENE_PARTNER_SYSTEM.format(
                user_character=state["user_character"],
                scene_title=state["scene_title"],
                play_title=state["play_title"],
                playwright=state["playwright"],
                ai_character=state["ai_character"],
                setting=state["setting"],
                relationship_dynamic=state["relationship_dynamic"],
                tone=state.get("tone", ""),
                primary_emotions=emotions_str,
                ai_character_description=state.get("ai_character_description", ""),
                user_character_description=state.get("user_character_description", ""),
                expected_line=expected_line,
                your_next_line=ai_line["text"],
                stage_direction_context=stage_direction_context,
                ai_stage_direction_context=ai_stage_direction_context,
            )),
            ("human", f'User\'s delivery: "{user_delivery}"')
        ])

        # Get AI response
        chain = prompt | json_llm
        response = chain.invoke({})

        # Parse structured JSON response
        line_text = ai_line["text"]  # fallback to scripted line
        feedback = ""
        tts_instructions = ""

        try:
            parsed = json.loads(response.content)
            line_text = parsed.get("line_text", ai_line["text"])
            feedback = parsed.get("feedback", "")
            tts_instructions = parsed.get("tts_instructions", "")
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse structured scene partner response, using raw")
            line_text = response.content
            feedback = ""
            tts_instructions = ""

        # Add to dialogue history
        state["dialogue_history"].append({
            "user_character": state["user_character"],
            "user_line": user_delivery,
            "ai_character": state["ai_character"],
            "ai_response": line_text,
            "line_index": current_idx
        })

        state["messages"].append({
            "type": "ai",
            "content": line_text,
            "line_text": line_text,
            "feedback": feedback,
            "tts_instructions": tts_instructions,
        })

        # Move to next line
        state["current_line_index"] += 1

        return state

    def _should_continue_scene(self, state: ScenePartnerState) -> str:
        """Determine next step in the rehearsal"""
        if state["mode"] == "completed":
            return "coach"

        if state["current_line_index"] >= len(state["all_lines"]):
            return "coach"

        # Check if user requested coaching
        if state.get("request_coaching", False):
            return "coach"

        return "continue"

    def _provide_coaching(self, state: ScenePartnerState) -> ScenePartnerState:
        """Provide overall performance feedback"""
        state["mode"] = "coaching"

        # Build dialogue summary
        dialogue_summary = "\n".join([
            f"{h['user_character']}: {h['user_line']}\n{h['ai_character']}: {h['ai_response']}"
            for h in state["dialogue_history"]
        ])

        prompt = ChatPromptTemplate.from_messages([
            ("system", COACHING_FEEDBACK_SYSTEM.format(
                scene_title=state["scene_title"],
                play_title=state["play_title"],
                user_character=state["user_character"],
                setting=state["setting"],
                relationship_dynamic=state["relationship_dynamic"],
                dialogue_history=dialogue_summary,
                feedback_notes="\n".join(state.get("feedback_notes", []))
            )),
            ("human", "Please provide your coaching feedback.")
        ])

        chain = prompt | self.llm
        response = chain.invoke({})

        state["messages"].append({
            "type": "coaching",
            "content": response.content
        })

        return state

    def _complete_session(self, state: ScenePartnerState) -> ScenePartnerState:
        """Mark session as complete"""
        state["mode"] = "completed"
        state["should_continue"] = False
        return state

    def invoke(self, state: ScenePartnerState) -> ScenePartnerState:
        """Run the scene partner graph"""
        return self.graph.invoke(state)


# ============================================================================
# Helper Functions
# ============================================================================

def create_scene_partner(
    scene_data: Dict,
    user_character: str,
    temperature: float = 0.7
) -> ScenePartnerGraph:
    """
    Create a configured scene partner for rehearsal.

    Args:
        scene_data: Scene information from database
        user_character: Which character the user is playing
        temperature: LLM creativity (0.0-1.0)

    Returns:
        Configured ScenePartnerGraph ready for rehearsal

    Example:
        >>> partner = create_scene_partner(scene_data, "Romeo")
        >>> result = partner.invoke(initial_state)
    """
    # Determine AI character (the other character in the scene)
    ai_character = (
        scene_data["character_2_name"]
        if user_character == scene_data["character_1_name"]
        else scene_data["character_1_name"]
    )

    return ScenePartnerGraph(temperature=temperature)


def format_rehearsal_transcript(dialogue_history: List[Dict]) -> str:
    """
    Format rehearsal dialogue into readable transcript.

    Args:
        dialogue_history: List of dialogue exchanges

    Returns:
        Formatted transcript string
    """
    lines = []
    for exchange in dialogue_history:
        lines.append(f"{exchange['user_character']}: {exchange['user_line']}")
        lines.append(f"{exchange['ai_character']}: {exchange['ai_response']}")
        lines.append("")  # Blank line between exchanges

    return "\n".join(lines)
