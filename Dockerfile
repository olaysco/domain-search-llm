# syntax=docker/dockerfile:1.6

# Stage 1: Build the Vue front-end assets
FROM node:20-bullseye AS frontend-builder
WORKDIR /workspace/web
COPY web/package*.json ./
RUN npm ci --no-audit
COPY web/ ./
RUN npm run build

# Stage 2: Build the Go server (with pre-built web assets)
FROM golang:1.24-bullseye AS go-builder
ENV GOPRIVATE=github.com/openprovider,openprovider.services,contracts.name,domingo.services
# Add github.com to known hosts for SSH
RUN mkdir -p -m 0600 ~/.ssh && ssh-keyscan github.com >> ~/.ssh/known_hosts
WORKDIR /workspace
COPY go.mod go.sum ./
# Configure git to use SSH for GitHub
RUN git config --global --add url."git@github.com:".insteadOf "https://github.com/"
RUN --mount=type=ssh go mod download
COPY . ./
COPY --from=frontend-builder /workspace/web/dist ./web/dist
RUN --mount=type=ssh CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /workspace/bin/domain-search ./cmd/server

# Stage 3: Minimal runtime image
FROM gcr.io/distroless/base-debian12
WORKDIR /app
COPY --from=go-builder /workspace/bin/domain-search ./domain-search
COPY --from=go-builder /workspace/web/dist ./web/dist
EXPOSE 8080 9090
ENTRYPOINT ["/app/domain-search"]
