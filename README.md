# Domain Search LLM

search domain with LLM

## Getting started

1. Install Go 1.21+, `protoc` (`protoc-gen-go` + `protoc-gen-go-grpc`), and Node 18+.
2. Build the Vue front-end:
   ```bash
   cd web
   npm install
   npm run build
   ```
3. From the repository root run the backend:
   ```bash
   go run ./cmd/server
   ```
4. Visit [http://localhost:8010](http://localhost:8010) and search for a keyword. The Vue SPA opens a gRPC-Web stream to `CheckPrice` and renders suggestions the moment each message arrives.

The gRPC server also listens on `localhost:9090` for native clients, so you can call it directly with tools such as [`grpcurl`](https://github.com/fullstorydev/grpcurl):

```bash
grpcurl -plaintext -d '{"query":"awesome"}' localhost:9090 domainsearch.v1.DomainSearchService/CheckPrice
```

Because `CheckPrice` is server-streaming, `grpcurl` will print suggestions as independent messages.

## Project layout

- `cmd/server`: entry point that wires the gRPC server, exposes gRPC-Web, and serves the front-end assets.
- `internal/domainsearch`: service implementation for the generated gRPC interface.
- `internal/gen/domainsearch/v1`: Go bindings generated from the protobuf definition.
- `proto/domainsearch/v1`: protobuf schema for the API surface.
- `web`: Vue 3 + Vite front-end. Use `npm run dev` for local development and `npm run build` for the static assets served by Go.


## Configuration

The server exposes a few flags you can tweak:

- `--grpc-addr` (default `:9090`): address for the gRPC server.
- `--http-addr` (default `:8010`): address for the HTTP/UI + gRPC-Web server.
- `--static-dir` (default `web/dist`): directory that holds the built front-end assets.

Example:

```bash
go run ./cmd/server --grpc-addr=:50051 --http-addr=:3000 --static-dir=web/dist
```
