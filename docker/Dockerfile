FROM oven/bun:1-alpine

# Chromium and system libraries required by Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev

# Use Alpine's system Chromium — skip Puppeteer's bundled download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json bun.lock ./
# Copy web's package.json (only needed for successfully resolving workspaces, no dependencies from web actually installed)
COPY web/package.json ./web/package.json
RUN bun install --production --frozen-lockfile

# Copy only source files needed at runtime
COPY src/ ./src/
COPY tsconfig.json ./

RUN mkdir -p ./output ./data

CMD ["bun", "src/index.ts"]
