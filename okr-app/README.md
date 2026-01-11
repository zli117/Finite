# OKR Tracker

A personal objectives and key results tracking system with flexible metrics, custom queries, and social features.

## Features

- **Daily/Weekly Task Management**: Track tasks with time tracking, tags, and progress attributes
- **OKR System**: Yearly and monthly objectives with weighted key results
- **Flexible Metrics**: User-defined daily metrics with computed values and external sources
- **Custom Queries**: JavaScript-based queries with QuickJS sandbox for data analysis
- **Dashboard Widgets**: Create custom visualizations with charts and tables
- **Friends**: View friends' dashboards (read-only) with private notes
- **Fitbit Integration**: Sync sleep, steps, and activity data
- **Admin Dashboard**: User management and query execution logs
- **PWA Support**: Installable progressive web app
- **Docker Ready**: Easy deployment with Docker Compose

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file:

```env
# Admin user (optional) - this username becomes admin on login
ADMIN_USERNAME=youruser

# Fitbit OAuth (optional)
FITBIT_CLIENT_ID=your_client_id
FITBIT_CLIENT_SECRET=your_client_secret
```

## Admin Dashboard

The admin dashboard provides user management and security monitoring.

### Designating an Admin

Set the `ADMIN_USERNAME` environment variable to the username that should have admin privileges:

```env
ADMIN_USERNAME=youruser
```

When that user logs in, they are automatically granted admin status.

### Admin Features

- **User Management**
  - View all registered users
  - Disable/enable user accounts (disabled users cannot log in)
  - Grant or revoke admin privileges
  - Permanently delete users (cascades to all their data)

- **Query Execution Logs**
  - View all custom query executions
  - Filter by user, success/failure, date range
  - See execution time and error messages
  - Audit trail for security monitoring

- **Statistics**
  - Total users, disabled users, admin count
  - Query executions (24h and 7d)
  - Error rates and average execution times

### Security

- All admin endpoints require `isAdmin: true`
- Cannot disable/delete your own account
- Disabling a user invalidates all their sessions
- Query code is sandboxed with QuickJS (WASM)
- Rate limiting: 30 queries/minute per user
- Code size limit: 100KB max

## Production Deployment

### Docker

```bash
# Build and run
docker compose up -d

# With admin user
ADMIN_USERNAME=youruser docker compose up -d
```

### Manual

```bash
# Build
npm run build

# Run
node build
```

## Database

Uses SQLite with Drizzle ORM. Database file is stored at `./data/okr.db`.

```bash
# Push schema changes
npm run db:push

# Open Drizzle Studio
npm run db:studio
```

## Backup & Restore

- **Export**: Settings > Backup > Export Data (JSON)
- **Import**: Settings > Backup > Import Data

Includes all user data: tasks, objectives, metrics, queries, widgets, and preferences.

## Development

```bash
# Development server
npm run dev

# Type check
npm run check

# Build
npm run build

# Preview production build
npm run preview
```

## Tech Stack

- **Frontend**: SvelteKit 5, Svelte 5 (runes)
- **Database**: SQLite + Drizzle ORM
- **Auth**: Session-based with bcrypt
- **Query Sandbox**: QuickJS (WebAssembly)
- **Charts**: Plotly.js
- **Styling**: CSS custom properties
