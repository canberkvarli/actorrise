# ScenePartner 🎭

**AI-powered scene rehearsal partner for actors**

## Overview

ScenePartner is ActorRise's revolutionary feature that provides actors with an AI scene partner available 24/7 for rehearsing two-person scenes. No more scheduling conflicts, no more waiting for scene partners - just instant, intelligent rehearsal whenever you need it.

## Features

### 🎬 Scene Library
- Curated collection of two-person scenes from classical and contemporary plays
- Browse by difficulty, tone, relationship dynamic, and more
- Detailed scene information including context, setting, and character descriptions

### 🤖 AI Scene Partner
- **LangGraph-powered** conversational AI that stays in character
- Responds naturally to your delivery
- Provides real-time feedback and coaching
- Adapts to your pacing and performance style

### 🎭 Intelligent Rehearsal
- Choose which character you want to play
- AI plays the other character authentically
- Back-and-forth dialogue that feels natural
- Progress tracking throughout the scene

### 📊 Performance Feedback
- **Strengths** - What you did well
- **Growth Opportunities** - Specific areas to improve
- **Overall Assessment** - Comprehensive performance analysis
- **Session Transcript** - Review the entire rehearsal

## User Experience

### Beautiful Theater-Inspired Design
- **Stage aesthetic** - Dark gradient backgrounds with spotlight effects
- **Curtain animations** - Theatrical entrances and transitions
- **Character bubbles** - Clear visual distinction between user and AI
- **Progress indicators** - Know exactly where you are in the scene

### Simple Workflow
1. **Browse scenes** - Find the perfect scene for your needs
2. **Preview the script** - Read through before rehearsing
3. **Choose your character** - Select which role to play
4. **Rehearse** - Practice with your AI scene partner
5. **Get feedback** - Receive coaching and insights

## Technical Architecture

### Backend (FastAPI + LangGraph)

**Database Models:**
- `Scene` - Two-person scene from a play
- `SceneLine` - Individual dialogue lines
- `RehearsalSession` - User's practice session
- `RehearsalLineDelivery` - Each line delivery with feedback
- `SceneFavorite` - User's saved scenes

**AI Components:**
- `scene_partner.py` - LangGraph conversation flow
- Maintains character throughout scene
- Provides context-aware responses
- Generates performance feedback

**API Endpoints:**
- `GET /api/scenes` - Browse available scenes
- `GET /api/scenes/{id}` - Get scene details with all lines
- `POST /api/scenes/rehearse/start` - Start a rehearsal session
- `POST /api/scenes/rehearse/deliver` - Deliver a line and get AI response
- `GET /api/scenes/rehearse/{session_id}/feedback` - Get session feedback
- `POST /api/scenes/{id}/favorite` - Toggle scene favorite

### Frontend (Next.js 15 + Framer Motion)

**Pages:**
- `/scenes` - Scene browser with filters
- `/scenes/[id]` - Scene detail and preview
- `/scenes/[id]/rehearse` - Live rehearsal interface

**Components:**
- Theater-inspired gradient backgrounds
- Smooth animations for message delivery
- Progress tracking and completion percentage
- Feedback modals with comprehensive insights

### AI Model

**LangGraph State Machine:**
```
present_line → receive_delivery → respond_as_character → [continue/coach/end]
                                                      ↓
                                              provide_coaching → complete_session
```

**Prompts:**
- `SCENE_PARTNER_SYSTEM` - Character embodiment and response
- `COACHING_FEEDBACK_SYSTEM` - Performance analysis

**Model:** GPT-4o-mini (cost-effective, fast responses)
**Temperature:** 0.7 (balanced creativity and consistency)

## Scene Extraction

Automated script extracts scenes from plays:

```bash
cd backend
python scripts/extract_scenes.py
```

**How it works:**
1. Parses play full_text into dialogue sections
2. Identifies two-character scenes (8-50 lines)
3. Ensures balanced dialogue between characters
4. AI analyzes scene for metadata (tone, emotions, difficulty)
5. Stores scene and lines in database

**Criteria for good scenes:**
- Exactly 2 characters
- 8-50 lines (manageable length)
- Both characters have 3+ lines each
- Dialogue ratio no more than 3:1
- Back-and-forth conversation (not monologues)

## Usage Examples

### For Beginners
Easy romantic or comedic scenes to build confidence.

**Example:** Simple romantic exchange from a comedy
- Low pressure
- Clear emotional beats
- Shorter scenes (8-15 lines)

### For Intermediate
Scenes with more complex emotions and relationship dynamics.

**Example:** Tense conversation between adversaries
- Multiple emotional shifts
- Subtext and character objectives
- Medium length (20-35 lines)

### For Advanced
Challenging scenes with depth and nuance.

**Example:** Tragic scene with philosophical undertones
- Complex character motivations
- Rich language and imagery
- Longer scenes (35-50 lines)

## Development Workflow

### Adding New Scenes

1. **Ensure plays have full_text in database**
   ```sql
   SELECT id, title, author FROM plays WHERE full_text IS NOT NULL;
   ```

2. **Run scene extractor**
   ```bash
   python scripts/extract_scenes.py
   ```

3. **Verify scenes**
   ```bash
   # Check database
   SELECT COUNT(*) FROM scenes;
   SELECT * FROM scenes ORDER BY created_at DESC LIMIT 5;
   ```

4. **Test in UI**
   - Browse scenes at `/scenes`
   - Preview scene detail
   - Start a rehearsal
   - Complete scene and check feedback

### Customizing AI Behavior

**Adjust temperature** (in `scene_partner.py`):
- Lower (0.3-0.5): More consistent, predictable responses
- Higher (0.7-0.9): More creative, varied responses

**Modify prompts** (in `scene_partner.py`):
- `SCENE_PARTNER_SYSTEM`: Character embodiment style
- `COACHING_FEEDBACK_SYSTEM`: Feedback tone and depth

**Change model** (in `config.py`):
- `gpt-4o-mini`: Fast, cost-effective (current)
- `gpt-4o`: Higher quality, more expensive
- `gpt-4`: Best quality, highest cost

## Performance Metrics

### Expected Response Times
- Scene browse: <200ms
- Scene detail load: <300ms
- AI response generation: 1-2 seconds
- Feedback generation: 2-3 seconds

### Cost Estimates (OpenAI)
- Per line delivery: ~$0.0001
- Per session feedback: ~$0.0005
- Per 100 rehearsals: ~$0.10

### Database Load
- Scene extraction: 5-10 scenes/minute
- Concurrent rehearsals: Scales with FastAPI workers
- Session storage: ~5KB per session

## Future Enhancements

### Phase 2 (Voice & Audio)
- [ ] Voice input via Web Speech API
- [ ] AI voice output (TTS)
- [ ] Accent/dialect options
- [ ] Recording playback

### Phase 3 (Advanced Features)
- [ ] Multi-session tracking
- [ ] Performance analytics over time
- [ ] Custom scene upload
- [ ] Scene recommendations based on profile
- [ ] Rehearsal scheduling/reminders

### Phase 4 (Social & Sharing)
- [ ] Share rehearsal transcripts
- [ ] Community scene ratings
- [ ] Virtual rehearsal rooms (multi-user)
- [ ] Director mode (third party observes)

## Troubleshooting

### Scenes not loading
- Check database connection
- Verify `full_text` exists for plays
- Run scene extraction script

### AI responses slow
- Check OpenAI API key
- Verify rate limits not exceeded
- Consider caching common responses

### Feedback not generating
- Check LangGraph logs
- Verify dialogue history captured
- Test with simpler prompts

## Design Philosophy

**Theater-First:**
Every design decision reflects the theatrical experience:
- Dark, atmospheric backgrounds (like a theater)
- Spotlight effects on active elements
- Curtain animations for transitions
- Stage-like chat interface

**Actor-Centric:**
Built for actors, by understanding their needs:
- No scheduling friction
- Immediate feedback
- Safe practice environment
- Professional coaching tone

**AI as Partner, Not Replacement:**
The AI enhances human creativity:
- Supportive, not judgmental
- Encouraging growth
- Acknowledging strengths first
- Specific, actionable feedback

## Credits

**Built with:**
- FastAPI - High-performance Python API
- LangChain/LangGraph - AI conversation orchestration
- Next.js 15 - React framework with App Router
- Framer Motion - Smooth animations
- OpenAI GPT-4o-mini - AI model
- PostgreSQL - Database
- TypeScript - Type-safe frontend

**Inspired by:**
- Real actors' need for flexible rehearsal
- Theater pedagogy and coaching practices
- Modern AI conversational design

---

*ScenePartner: Your scene partner, always ready, always supportive.*
