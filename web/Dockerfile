FROM node:24.21.0-alpine3.24 AS build

WORKDIR /app
RUN npm install -g pnpm@12.3.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:24.21.0-alpine3.24

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./

USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
