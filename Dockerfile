# Build stage for client
FROM node:20-bookworm-slim AS client-builder

WORKDIR /app/client

# Copy client package files
COPY client/package*.json ./

# Install client dependencies
RUN npm ci

# Copy client source
COPY client/ ./

# Build client for production
RUN npm run build

# Production stage - using Debian slim instead of Alpine for better Sharp compatibility
FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies for sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

# Copy server package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy server files
COPY server/ ./server/

# Copy built client from builder stage
COPY --from=client-builder /app/client/dist ./client/dist

# Create directory for serving static files
RUN mkdir -p /app/public

# Expose port
EXPOSE 3002

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3002

# Start the server
CMD ["node", "server/index.js"]
