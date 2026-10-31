# Образ бэкенда: статический бинарник Go в минимальном alpine, процесс без root.
FROM golang:1.26-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.22
RUN apk --no-cache add ca-certificates \
    && addgroup -S app \
    && adduser -S -G app -H -s /sbin/nologin app
WORKDIR /app
COPY --from=builder /out/server /app/server
USER app

EXPOSE 8080
# /api/health отвечает 200, только если MongoDB доступна.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/server"]
