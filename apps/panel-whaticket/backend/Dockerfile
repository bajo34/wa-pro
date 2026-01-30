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

# Google Chrome repo (nuevo método, sin apt-key)
RUN mkdir -p /etc/apt/keyrings \
  && wget -qO /etc/apt/keyrings/google-linux-signing-key.gpg https://dl.google.com/linux/linux_signing_key.pub \
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
ENV NODE_ENV=production
ENV PORT=3000
ENV CHROME_BIN=google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD sh -lc "dockerize -wait ${DATABASE_URL} && npx sequelize db:migrate && node dist/server.js"
