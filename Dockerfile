FROM node:22-alpine AS build-client
WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
RUN cd client && npm run build

FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server ./server
COPY --from=build-client /app/client/dist ./public
COPY players.json ./players.json

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/queuec.db

EXPOSE 3001
CMD ["node", "server/index.js"]
