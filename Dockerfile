You’re not really “converting Compose to a Dockerfile”—that’s a category mistake.
👉 A **Dockerfile builds one service image**, while **Docker Compose** runs multiple services together.

So for production you’ll typically have:

* ✅ **One Dockerfile per service**
* ✅ (Optional) a slimmer `docker-compose.prod.yml` just to orchestrate

Let’s do it properly 👇

---

# 🏗️ 1. Production Dockerfile (Server)

Create: `packages/server/Dockerfile`

```Dockerfile
# ---------- Build Stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package files first (for caching)
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/

RUN npm install

# Copy full code
COPY . .

# Build the server (important)
RUN npm run build --workspace @multilang-call/server


# ---------- Production Stage ----------
FROM node:20-alpine

WORKDIR /app

# Copy only necessary files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "dist/index.js"]
```

---

# 🤖 2. Production Dockerfile (AI Pipeline)

Create: `packages/ai-pipeline/Dockerfile`

```Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/ai-pipeline/package*.json ./packages/ai-pipeline/

RUN npm install

COPY . .

RUN npm run build --workspace @multilang-call/ai-pipeline


FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ai-pipeline/dist ./dist
COPY --from=builder /app/packages/ai-pipeline/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 5001

CMD ["node", "dist/index.js"]
```

---

# 🌐 3. Production Dockerfile (Client)

If you're using React/Vite:

Create: `packages/client/Dockerfile`

```Dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/client/package*.json ./packages/client/

RUN npm install

COPY . .

RUN npm run build --workspace @multilang-call/client


# Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

---

# 🧩 4. Production Compose (Clean Version)

Create: `docker-compose.prod.yml`

```yaml
version: "3.9"

services:
  mysql:
    image: mysql:8.4
    restart: always
    environment:
      MYSQL_DATABASE: multilang_call
      MYSQL_USER: multilang
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql

  redis:
    image: redis:7.4
    restart: always
    volumes:
      - redis-data:/data

  ai-pipeline:
    build:
      context: .
      dockerfile: packages/ai-pipeline/Dockerfile
    restart: always
    environment:
      AI_PIPELINE_PORT: 5001
      REDIS_URL: redis://redis:6379
      DEEPL_API_KEY: ${DEEPL_API_KEY}
      DEEPGRAM_API_KEY: ${DEEPGRAM_API_KEY}
    depends_on:
      - redis

  server:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    restart: always
    environment:
      PORT: 4000
      DATABASE_URL: mysql://multilang:${MYSQL_PASSWORD}@mysql:3306/multilang_call
      REDIS_URL: redis://redis:6379
      AI_PIPELINE_URL: http://ai-pipeline:5001
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - mysql
      - redis
      - ai-pipeline

  client:
    build:
      context: .
      dockerfile: packages/client/Dockerfile
    restart: always
    ports:
      - "3000:80"
    depends_on:
      - server

volumes:
  mysql-data:
  redis-data:
```

---

# 🔐 5. Add `.env` (VERY IMPORTANT)

```env
MYSQL_PASSWORD=strong_password
MYSQL_ROOT_PASSWORD=strong_root_password
JWT_SECRET=very_long_random_string_123456
DEEPL_API_KEY=your_key
DEEPGRAM_API_KEY=your_key
```

---

# 🚀 6. Run Production

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

---

# ⚠️ Key Production Fixes You Just Got

✔ No `npm install` at runtime
✔ No `npm run dev` (only built code)
✔ Smaller images
✔ Faster startup
✔ Secure env handling

---

# 🧠 Final Reality Check

What you had before:

* Dev containers ❌

What you now have:

* Production-ready images ✅

---

If you want next step, I can:

* Add **Nginx reverse proxy + domain**
* Add **HTTPS (SSL)**
* Or deploy this on **AWS / VPS step-by-step**

Just tell me 👍
