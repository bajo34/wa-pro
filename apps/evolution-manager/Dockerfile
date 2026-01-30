FROM node:20-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the source code
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY sql ./sql

# Build TypeScript into dist folder and remove dev dependencies
RUN npm run build && npm prune --omit=dev

# Environment and runtime settings
ENV NODE_ENV=production
EXPOSE 3001

# Start the compiled application
CMD ["node","dist/index.js"]