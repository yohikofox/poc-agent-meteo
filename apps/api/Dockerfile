FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S api && adduser -S api -G api
COPY --from=builder --chown=api:api /app/dist ./dist
COPY --from=builder --chown=api:api /app/node_modules ./node_modules
USER api
EXPOSE 3000
CMD ["node", "dist/index.js"]
