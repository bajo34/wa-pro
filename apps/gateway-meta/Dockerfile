FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node","dist/index.js"]
