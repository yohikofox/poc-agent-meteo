FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S agent && adduser -S agent -G agent
COPY --from=builder --chown=agent:agent /app/dist ./dist
COPY --from=builder --chown=agent:agent /app/node_modules ./node_modules
USER agent
# AGENT_TYPE est passé via --build-arg et hérité comme variable d'environnement
ARG AGENT_TYPE
ENV AGENT_TYPE=${AGENT_TYPE}
ENTRYPOINT ["sh", "-c", "node dist/${AGENT_TYPE}/index.js"]
