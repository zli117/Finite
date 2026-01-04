# Build stage
FROM node:22-alpine AS builder

# Install build dependencies for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:22-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache sqlite

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S okr -u 1001 -G nodejs

# Copy built application
COPY --from=builder --chown=okr:nodejs /app/build ./build
COPY --from=builder --chown=okr:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=okr:nodejs /app/package.json ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown okr:nodejs /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/okr.db

# Expose port
EXPOSE 3000

# Switch to non-root user
USER okr

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/me || exit 1

# Start the application
CMD ["node", "build"]
