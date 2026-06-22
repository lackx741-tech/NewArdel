FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Create log directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "index.js"]
