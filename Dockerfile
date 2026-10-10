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
FROM golang:1.23-alpine AS server
WORKDIR /src
RUN apk add --no-cache git
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
# Static binary so the runtime image can be distroless.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/torquedesk-server .

# ---- 3. Runtime image --------------------------------------------------------
FROM gcr.io/distroless/base-debian12:nonroot
WORKDIR /app
ENV STATIC_DIR=/app/dist \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    ADDR=:8080
COPY --from=server    /out/torquedesk-server /app/torquedesk-server
COPY --from=frontend  /app/dist              /app/dist
USER nonroot:nonroot
EXPOSE 8080
VOLUME ["/data"]
ENTRYPOINT ["/app/torquedesk-server"]
