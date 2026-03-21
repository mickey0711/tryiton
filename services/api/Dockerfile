FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source and build
COPY . .
RUN npm install --save-dev typescript tsx
RUN npx tsc --skipLibCheck || true

# Expose port
EXPOSE 8080

# Start
CMD ["node", "dist/server.js"]
