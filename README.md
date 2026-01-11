# OKR Tracker

A personal OKR (Objectives and Key Results) tracking system with daily planning, custom metrics, and flexible data queries. Built with SvelteKit 5 and SQLite.

## Features

- **OKR Management**: Create yearly and monthly objectives with weighted key results
- **Flexible Key Results**: Score via slider, checkboxes, or custom JavaScript queries
- **Daily/Weekly Planning**: Track tasks, time spent, and progress
- **Custom Metrics**: Define your own daily metrics with computed fields
- **Query System**: Write custom JavaScript queries in a sandboxed QuickJS environment
- **Fitbit Integration**: Sync sleep, steps, and activity data
- **Multi-User Support**: Session-based authentication with bcrypt password hashing
- **Real-Time Sync**: Server-Sent Events for cross-device synchronization
- **PWA**: Installable as a Progressive Web App
- **Backup/Restore**: Export and import all your data as JSON

## Tech Stack

- **Framework**: SvelteKit 5 with Svelte 5 runes
- **Database**: SQLite with Drizzle ORM
- **Query Sandbox**: QuickJS (via quickjs-emscripten)
- **Charting**: Plotly.js
- **Code Editor**: Monaco Editor
- **Authentication**: Session cookies with bcrypt

## Local Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
cd okr-app

# Install dependencies
npm install

# Initialize the database
npm run db:push

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

Create a `.env` file in `okr-app/` for optional configuration:

```env
# Database location (default: ./data/okr.db)
DATABASE_PATH=./data/okr.db

# Fitbit OAuth (optional)
FITBIT_CLIENT_ID=your_client_id
FITBIT_CLIENT_SECRET=your_client_secret
PUBLIC_BASE_URL=http://localhost:5173
```

## Production Deployment

### Using Docker (Recommended)

```bash
cd okr-app

# Build and run with Docker Compose
docker compose up -d

# Or build manually
docker build -t okr-tracker .
docker run -d -p 3000:3000 -v okr-data:/app/data okr-tracker
```

The app will be available at `http://localhost:3000`.

### Manual Deployment

```bash
cd okr-app

# Build for production
npm run build

# Set environment variables
export NODE_ENV=production
export DATABASE_PATH=/path/to/okr.db

# Run
node build
```

### Docker Compose Configuration

The included `docker-compose.yml` supports:

```yaml
environment:
  - NODE_ENV=production
  - DATABASE_PATH=/app/data/okr.db
  # Fitbit OAuth (optional)
  - FITBIT_CLIENT_ID=your_client_id
  - FITBIT_CLIENT_SECRET=your_client_secret
  - PUBLIC_BASE_URL=https://okr.example.com
```

## Database Management

### Available Commands

```bash
# Push schema changes to database (for development)
npm run db:push

# Generate SQL migration files
npm run db:generate

# Run migrations
npm run db:migrate

# Open Drizzle Studio (database browser)
npm run db:studio
```

### Database Location

- **Development**: `okr-app/data/okr.db`
- **Docker**: `/app/data/okr.db` (mounted as `okr-data` volume)
- **Custom**: Set via `DATABASE_PATH` environment variable

### Reset Database

To start fresh, stop the app and delete the database files:

```bash
# Stop the app first!
rm okr-app/data/okr.db okr-app/data/okr.db-wal okr-app/data/okr.db-shm

# Recreate schema
npm run db:push
```

The `-wal` and `-shm` files are SQLite WAL (Write-Ahead Logging) files. Always delete all three together.

### Backup and Restore

Use the Settings page in the app to:
- **Download Backup**: Exports all your data as JSON
- **Restore Backup**: Import a previously exported JSON file

## Project Structure

```
okr-app/
├── src/
│   ├── lib/
│   │   ├── components/     # Svelte components
│   │   ├── db/
│   │   │   ├── schema.ts   # Database schema (Drizzle)
│   │   │   └── client.ts   # Database connection
│   │   └── server/         # Server-side utilities
│   └── routes/
│       ├── api/            # API endpoints
│       ├── daily/          # Daily planning page
│       ├── weekly/         # Weekly planning page
│       ├── objectives/     # OKR management
│       ├── queries/        # Custom queries
│       └── settings/       # User settings
├── drizzle/                # Migration files
├── static/                 # Static assets (icons, manifest)
├── Dockerfile
├── docker-compose.yml
└── drizzle.config.ts
```

## License

Private project.
