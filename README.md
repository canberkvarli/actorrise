# ActorRise Platform

A modern acting platform built with Next.js and FastAPI. Currently featuring authentication and profile management, with AI-powered features coming soon.

## 🎭 Current Features

- **Authentication**: Secure Supabase authentication with JWT token verification
- **Actor Profiles**: Comprehensive profile system for actors
  - Basic info (name, age range, gender, ethnicity, height, build, location)
  - Acting info (experience level, type, training background, union status)
  - Preferences (preferred genres, profile bias settings)
  - Headshot upload with image processing
- **Dashboard**: User dashboard with profile completion tracking
- **Modern UI**: Beautiful design with shadcn/ui components and dark theme

## 🚀 Coming Soon

- **MonologueMatch**: AI-powered monologue discovery and recommendations
- **ScenePartner**: AI scene reader
- **CraftCoach**: AI feedback on performances
- **AuditionTracker**: Track your auditions

## 🛠 Tech Stack

### Frontend
- **Next.js 16** (App Router)
- **TypeScript**
- **shadcn/ui** - Modern component library
- **Tailwind CSS v4**
- **React Hook Form + Zod** - Form validation
- **Supabase** - Authentication client
- **Framer Motion** - Animations
- **Sonner** - Toast notifications

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - Database ORM
- **PostgreSQL** - Database (via psycopg2)
- **Supabase** - Authentication & Storage
- **Pydantic** - Data validation
- **Pillow** - Image processing
- **uv** - Modern Python package manager

## 📋 Prerequisites

- **Node.js 18+**
- **Python 3.9+**
- **uv** - Modern Python package manager (install via `curl -LsSf https://astral.sh/uv/install.sh | sh` or `pip install uv`)
- **PostgreSQL** database
- **Supabase** account (for auth and storage)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd actorrise
```

### 2. Frontend Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# Optional: Google Analytics (GA4) – set to your Measurement ID (e.g. G-XXXXXXXXXX) for extra analytics alongside Vercel
# NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

```bash
# Start development server
npm run dev
```

Frontend will run on **http://localhost:3000**

### 3. Backend Setup

```bash
cd backend

# Install dependencies (uv handles venv automatically)
uv pip install -e .

# Create environment file
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/actorrise
JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256
CORS_ORIGINS=http://localhost:3000
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=headshots
```

```bash
# Start development server (no venv activation needed!)
uv run uvicorn app.main:app --reload
```

Backend will run on **http://localhost:8000**

### 4. Database Setup

Make sure PostgreSQL is running and create a database:

```sql
CREATE DATABASE actorrise;
```

The database tables will be automatically created on first startup via SQLAlchemy.

## 📁 Project Structure

```
actorrise/
├── app/                    # Next.js app router pages
│   ├── (auth)/            # Authentication pages
│   │   ├── login/
│   │   └── signup/
│   └── (platform)/        # Protected platform pages
│       ├── dashboard/
│       ├── profile/
│       └── search/         # Coming soon
├── components/             # React components
│   ├── auth/              # Authentication components
│   ├── profile/           # Profile components
│   ├── search/           # Search components (for future)
│   └── ui/               # shadcn/ui components
├── lib/                   # Utilities
│   ├── api.ts            # API client (fetch-based)
│   ├── auth.tsx          # Auth context
│   ├── supabase.ts       # Supabase client
│   └── utils.ts          # Utility functions
├── types/                 # TypeScript types
├── backend/              # FastAPI application
│   ├── app/
│   │   ├── api/          # API endpoints
│   │   │   ├── auth.py   # Authentication endpoints
│   │   │   └── profile.py # Profile endpoints
│   │   ├── core/         # Core utilities
│   │   │   ├── config.py      # Configuration
│   │   │   ├── database.py    # Database setup
│   │   │   └── security.py   # JWT verification
│   │   ├── models/       # Database models
│   │   │   ├── actor.py  # Actor profile model
│   │   │   └── user.py   # User model
│   │   ├── services/     # Business logic
│   │   │   └── storage.py # Supabase storage
│   │   └── main.py       # FastAPI app
│   └── pyproject.toml    # Python dependencies (uv)
└── README.md
```

## 🔐 Environment Variables

### Frontend (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Backend (.env)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/actorrise

# JWT (for token decoding, Supabase handles signing)
JWT_SECRET=your-secret-key-change-in-production
JWT_ALGORITHM=HS256

# CORS
CORS_ORIGINS=http://localhost:3000

# Supabase
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_STORAGE_BUCKET=headshots
```

## 📖 Usage

1. **Sign Up**: Create an account at `/signup`
2. **Login**: Sign in at `/login`
3. **Complete Profile**: Fill out your actor profile at `/profile`
   - Upload a headshot
   - Set your preferences
   - Enable profile bias for future recommendations
4. **Dashboard**: View your profile completion and stats at `/dashboard`
5. **Search**: Coming soon - AI-powered monologue search

## 🧪 Development

### Running the Application

```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - Backend
cd backend
uv run uvicorn app.main:app --reload
```

### Linting

```bash
# Frontend
npm run lint

# Backend (if you add pylint/flake8)
cd backend
pylint app/
```

## 🗄 Database

The application uses PostgreSQL. Tables are automatically created via SQLAlchemy on startup:

- `users` - User accounts (synced with Supabase)
- `actor_profiles` - Actor profile information
- `monologues` - Monologue database (for future AI search)

## 🔒 Authentication Flow

1. User signs up/logs in via Supabase Auth (frontend)
2. Frontend receives JWT token from Supabase
3. Frontend sends token in `Authorization: Bearer <token>` header
4. Backend verifies token and extracts user info
5. Backend creates/updates user in local database
6. User is authenticated for API requests

## 📝 API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user info

### Profile
- `GET /api/profile` - Get user's actor profile
- `POST /api/profile` - Create/update actor profile
- `POST /api/profile/headshot` - Upload headshot image
- `GET /api/profile/stats` - Get profile completion stats

## 🎨 UI Components

Built with [shadcn/ui](https://ui.shadcn.com/) components:
- Button, Card, Input, Label, Select, Switch
- Dialog, Tooltip, Progress, Badge
- Tabs, Separator, Skeleton
- All components are customizable and themeable

## 🚧 Roadmap

- [ ] AI-powered monologue search (MonologueMatch)
- [ ] Semantic search with embeddings
- [ ] ScenePartner - AI scene reader
- [ ] CraftCoach - AI performance feedback
- [ ] AuditionTracker
- [ ] Advanced analytics dashboard

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

Built with ❤️ for actors everywhere
