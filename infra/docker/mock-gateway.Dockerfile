FROM node:22-alpine

RUN apk add --no-cache curl tini && corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=development
EXPOSE 18789
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@clawwork/mock-gateway", "start"]
