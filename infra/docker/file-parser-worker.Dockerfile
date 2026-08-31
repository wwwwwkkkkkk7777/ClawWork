FROM node:26-alpine

RUN apk add --no-cache curl tini && corepack enable && corepack prepare pnpm@10.25.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
EXPOSE 3003
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pnpm", "--filter", "@clawwork/file-parser-worker", "start"]
