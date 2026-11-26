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
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js", "--http"]
