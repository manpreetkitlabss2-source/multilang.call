FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/client/package.json packages/client/package.json

RUN npm install

COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

RUN npm run build --workspace @multilang-call/shared
RUN npm run build --workspace @multilang-call/client

FROM nginx:alpine

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
COPY packages/client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
