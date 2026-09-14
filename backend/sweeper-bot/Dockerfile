FROM node:20-alpine

WORKDIR /app/backend/sweeper-bot

# Install dependencies
COPY backend/sweeper-bot/package*.json ./
RUN npm ci --omit=dev

# Copy source code plus the compiled contract artifacts the bot loads at runtime.
COPY backend/sweeper-bot ./
COPY artifacts /app/artifacts

# Create log directory
RUN mkdir -p logs

CMD ["node", "index.js"]
