FROM oven/bun:1.4.2 AS build
WORKDIR /build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun run test && bun --bun run lint && bun --bun run build

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY --from=build --chown=101:101 /build/dist /usr/share/nginx/html
COPY --chown=101:101 --chmod=0644 nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 9009
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --quiet --output-document=/dev/null http://127.0.0.1:9009/health || exit 1
ENTRYPOINT ["nginx", "-g", "daemon off;"]
