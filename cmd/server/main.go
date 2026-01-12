package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/improbable-eng/grpc-web/go/grpcweb"
	"github.com/joho/godotenv"
	domainsearch "github.com/olaysco/domain-search-llm/internal/domainsearch"
	domainsearchv1 "github.com/olaysco/domain-search-llm/internal/gen/domainsearch/v1"
	"github.com/olaysco/domain-search-llm/internal/llm"
	"google.golang.org/grpc"
)

func main() {
	_ = godotenv.Load()
	var (
		grpcAddr  = flag.String("grpc-addr", ":9090", "address for the gRPC server")
		httpAddr  = flag.String("http-addr", ":8080", "address for the HTTP server that hosts the UI and gRPC-Web")
		staticDir = flag.String("static-dir", "web", "directory that holds the static web assets")
	)
	flag.Parse()

	if err := ensureDir(*staticDir); err != nil {
		log.Fatalf("static directory: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	grpcServer := grpc.NewServer()
	llmConfig := &llm.Config{
		AIEndpoint: os.Getenv("AI_ENDPOINT"),
		AIAPIKey:   os.Getenv("AI_API_KEY"),
		AIModel:    os.Getenv("AI_MODEL"),
	}
	suggesterService := llm.NewLLMSuggester(*llmConfig)
	domainsearchv1.RegisterDomainSearchServiceServer(grpcServer, domainsearch.NewSearchService(suggesterService))

	grpcLis, err := net.Listen("tcp", *grpcAddr)
	if err != nil {
		log.Fatalf("listen gRPC: %v", err)
	}
	go func() {
		log.Printf("gRPC server listening on %s", *grpcAddr)
		if err := grpcServer.Serve(grpcLis); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			log.Fatalf("gRPC server: %v", err)
		}
	}()

	grpcWebServer := grpcweb.WrapServer(
		grpcServer,
		grpcweb.WithOriginFunc(func(string) bool { return true }),
		grpcweb.WithWebsockets(true),
	)

	staticHandler := spaHandler(*staticDir)
	rootHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case grpcWebServer.IsGrpcWebRequest(r),
			grpcWebServer.IsGrpcWebSocketRequest(r),
			grpcWebServer.IsAcceptableGrpcCorsRequest(r):
			grpcWebServer.ServeHTTP(w, r)
		default:
			staticHandler.ServeHTTP(w, r)
		}
	})

	httpServer := &http.Server{
		Addr:         *httpAddr,
		Handler:      loggingMiddleware(rootHandler),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("http shutdown: %v", err)
		}
		grpcServer.GracefulStop()
	}()

	log.Printf("UI available at http://localhost%s", *httpAddr)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("http server: %v", err)
	}
}

func ensureDir(path string) error {
	info, err := os.Stat(path)
	if err == nil && info.IsDir() {
		return nil
	}
	if err == nil {
		return fmt.Errorf("%s exists but is not a directory", path)
	}
	if errors.Is(err, os.ErrNotExist) {
		return os.MkdirAll(path, 0o755)
	}
	return err
}

func spaHandler(staticDir string) http.Handler {
	fs := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		if path == "/" || path == "." {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}
		fs.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start))
	})
}
