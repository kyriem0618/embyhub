# EmbyHub Dockerfile
FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite-dev

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY web/ ./web/

RUN mkdir -p /app/data

ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/embyhub.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/emby/test || exit 1

CMD ["node", "src/index.js"]