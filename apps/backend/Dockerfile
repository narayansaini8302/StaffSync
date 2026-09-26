FROM node:20-slim AS builder

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

# Install dependencies
RUN npm install

# Copy backend source
COPY apps/backend ./apps/backend

# Generate Prisma Client & Build
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build

# ============ RUNNER STAGE ============
FROM node:20-slim AS runner

# Install Puppeteer / Chromium runtime dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    openssl \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["node", "dist/index.js"]
