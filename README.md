# ActorRise Platform

A complete acting platform featuring MonologueMatch, ScenePartner, CraftCoach, and AuditionTracker.

## Features

- **MonologueMatch**: AI-powered monologue discovery with profile-based recommendations
- **Authentication**: Secure Supabase authentication system
- **Actor Profiles**: Comprehensive profile system for personalized recommendations
- **Smart Search**: Natural language search with optional profile bias
- **Beautiful UI**: Modern design with shadcn/ui components

## Tech Stack

### Frontend
- Next.js 14+ (App Router)
- TypeScript
- shadcn/ui (Modern orange/blue theme)
- Tailwind CSS v4
- React Hook Form + Zod
- Axios

### Backend
- FastAPI
- SQLAlchemy (SQLite for MVP)
- Supabase Authentication
- Pydantic for validation

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.9+
- npm or yarn

### Frontend Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your API URL
npm run dev
```

Frontend will run on http://localhost:3000

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/act ivate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your configuration
uvicorn app.main:app --reload
```

Backend will run on http://localhost:8000

### Database

The database is automatically initialized and seeded with sample monologues on first startup.

## Project Structure

```
actorrise/
├── app/              # Next.js app router pages
├── components/       # React components
├── lib/              # Utilities and API client
├── types/            # TypeScript types
├── public/           # Static assets
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── api/      # API endpoints
│   │   ├── core/     # Core utilities (auth, database)
│   │   ├── models/   # Database models
│   │   └── services/ # Business logic (AI service)
│   └── requirements.txt
└── README.md
```

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)
```
DATABASE_URL=sqlite:///./database.db
JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
CORS_ORIGINS=http://localhost:3000
OPENAI_API_KEY=optional-for-mvp
```

## Usage

1. **Sign Up**: Create an account at `/signup`
2. **Demo Login**: Try the demo account with one click on the login page
3. **Complete Profile**: Fill out your actor profile at `/profile`
4. **Search Monologues**: Use MonologueMatch at `/search` to find perfect monologues
5. **Dashboard**: View your dashboard at `/dashboard`

### Demo Account
For testing, use the demo login button on the login page:
- Email: demo@actorrise.com
- Password: demo123


## Development

### Running Tests
```bash
# Frontend
npm run lint

# Backend
cd backend
pytest  # (when tests are added)
```

### Database Migrations
Currently using SQLite. For production, migrate to PostgreSQL and use Alembic for migrations.

## Future Features

- ScenePartner (AI scene reader)
- CraftCoach (AI feedback)
- AuditionTracker
- ScriptVault
- Real OpenAI integration for recommendations
- Image upload for headshots
- Advanced analytics

## License

MIT
