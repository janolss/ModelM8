FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY knowledge ./knowledge
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
# Default HOST is 127.0.0.1 (see loadConfig). For published ports set HOST=0.0.0.0
# explicitly — HTTP /mcp has no auth; do not expose it on untrusted networks.
ENV PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY knowledge ./knowledge
EXPOSE 3000
CMD ["node", "dist/index.js", "--http"]
