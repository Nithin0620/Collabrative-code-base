# Stage 1: Build the Frontend
FROM node:26-alpine AS frontend-builder
WORKDIR /app
COPY ./Frontend/package*.json ./
RUN npm ci || npm install
COPY ./Frontend ./
RUN npm run build

# Stage 2: Build and run the Backend
FROM node:26-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY ./Backend/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY ./Backend ./
COPY --from=frontend-builder /app/dist ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]