# ── Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
# El tarball del fork de AlphaTab debe estar presente antes del install
# (dependencia file:alphatab-fork.tgz en package.json).
COPY package.json alphatab-fork.tgz ./
RUN npm install
COPY . .
RUN npm run build

# ── Serve ────────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
