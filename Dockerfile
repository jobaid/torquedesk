# ---- 1. Build the frontend ---------------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.* ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---- 2. Build the Go server --------------------------------------------------
# Must match the toolchain in server/go.mod (currently 1.27.1). Pinning so
# the build is reproducible rather than following :alpine (floating tag).
FROM golang:1.27-alpine AS server
WORKDIR /src
RUN apk add --no-cache git ca-certificates && update-ca-certificates
COPY server/go.mod server/go.sum ./
# GOFLAGS lets us run offline-ish; GOPROXY is tried in order so a flaky
# proxy.golang.org falls through to direct.
ENV GOPROXY=https://proxy.golang.org,direct \
    GOSUMDB=sum.golang.org \
    CGO_ENABLED=0
RUN go mod download
COPY server/ ./
# Static binary so the runtime image can be distroless.
RUN GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/torquedesk-server .

# ---- 3. Runtime image --------------------------------------------------------
# Alpine (not distroless) so we can create the data directories with the
# right ownership BEFORE declaring VOLUME. Volume content inherits directory
# ownership from the image on first mount, so uploads + backups are writable
# by the server process without a wrapper script.
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S torquedesk \
 && adduser -S -G torquedesk -u 10001 torquedesk \
 && mkdir -p /data/uploads /data/backups /app/dist \
 && chown -R torquedesk:torquedesk /data /app
WORKDIR /app
ENV STATIC_DIR=/app/dist \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    ADDR=:8080
COPY --from=server    --chown=torquedesk:torquedesk /out/torquedesk-server /app/torquedesk-server
COPY --from=frontend  --chown=torquedesk:torquedesk /app/dist              /app/dist
USER torquedesk:torquedesk
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/torquedesk-server"]
