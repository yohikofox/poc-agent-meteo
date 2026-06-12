FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S web && adduser -S web -G web
COPY --from=builder --chown=web:web /app/.next/standalone ./
COPY --from=builder --chown=web:web /app/.next/static ./.next/static
COPY --from=builder --chown=web:web /app/public ./public
USER web
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
