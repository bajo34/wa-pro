FROM node:20-bookworm-slim as build-deps

# deps base
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    wget ca-certificates gnupg \
  && rm -rf /var/lib/apt/lists/*

# dockerize
ENV DOCKERIZE_VERSION=v0.6.1
RUN wget -q https://github.com/jwilder/dockerize/releases/download/${DOCKERIZE_VERSION}/dockerize-linux-amd64-${DOCKERIZE_VERSION}.tar.gz \
  && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-${DOCKERIZE_VERSION}.tar.gz \
  && rm dockerize-linux-amd64-${DOCKERIZE_VERSION}.tar.gz

# Google Chrome repo (FIX: dearmor de la key)
RUN mkdir -p /etc/apt/keyrings \
  && wget -qO- https://dl.google.com/linux/linux_signing_key.pub \
     | gpg --dearmor -o /etc/apt/keyrings/google-linux-signing-key.gpg \
  && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-linux-signing-key.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
     > /etc/apt/sources.list.d/google-chrome.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    google-chrome-stable \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf \
    libxss1 \
  && rm -rf /var/lib/apt/lists/*

# dumb-init
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.1/dumb-init_1.2.1_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=development
ENV PORT=3000
ENV CHROME_BIN=google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
# Install all deps for build (TypeScript lives in devDeps), then prune.
# We intentionally avoid npm ci here because this repo does not ship a package-lock.json
# and Railway Docker builds would fail with `npm ci`.
RUN npm install --include=dev

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

# Runtime environment
ENV NODE_ENV=production

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD sh -lc "dockerize -wait tcp://${DB_HOST}:${DB_PORT:-5432} && npx sequelize db:migrate && node dist/server.js"
