FROM node:24.21.0-alpine3.24

WORKDIR /app
RUN npm install -g pnpm@12.3.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
