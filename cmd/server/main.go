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
	client "github.com/olaysco/domain-search-llm/internal/grpc"
	"github.com/olaysco/domain-search-llm/internal/llm"
	"github.com/olaysco/domain-search-llm/internal/logger"
	"github.com/olaysco/domain-search-llm/internal/provider"
	pricepb "github.com/openprovider/contracts/v2/product/price"
	"github.com/tmc/langchaingo/llms/mistral"
	"go.uber.org/zap"
	"google.golang.org/grpc"
)

func main() {
	_ = godotenv.Load()
	var (
		grpcAddr     = flag.String("grpc-addr", ":9090", "address for the gRPC server")
		httpAddr     = flag.String("http-addr", envOrDefault("HTTP_ADDR", ":8080"), "address for the HTTP server that hosts the UI and gRPC-Web")
		staticDir    = flag.String("static-dir", "web/dist", "directory that holds the built static web assets")
		priceAddr    = flag.String("price-addr", envOrDefault("PRICE_SERVICE_ADDR", ""), "address for the upstream price gRPC service")
		priceAddrTls = flag.Bool("price-addr-tls", envOrDefault("PRICE_SERVICE_ADDR_TLS", "true") == "true", "address for the price service supports tls")
	)
	flag.Parse()
	log := logger.New()
	defer log.Sync()

	if err := ensureDir(*staticDir); err != nil {
		log.Fatal("static directory ", zap.Error(err))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *priceAddr == "" {
		log.Fatal("price service address is not configured (set --price-addr or PRICE_SERVICE_ADDR)")
	}
	socketAddrPrefix := ""
	if *priceAddrTls {
		socketAddrPrefix = ":443"
	}
	socketAddr := fmt.Sprintf("%s%s", *priceAddr, socketAddrPrefix)
	log.Info(socketAddr)

	cfg := &client.Config{
		Target:       socketAddr,
		ServerName:   *priceAddr,
		Insecure:     !*priceAddrTls,
		WaitForReady: true,
	}

	priceConn, err := client.New(cfg)
	if err != nil {
		log.Fatal("unable to connect to price nameserver ", zap.Error(err))
	}

	defer priceConn.Close()
	priceSvc := provider.NewPriceService(pricepb.NewPriceServiceClient(priceConn))

	grpcServer := grpc.NewServer()
	llmConfig := &llm.Config{
		AIEndpoint: os.Getenv("AI_ENDPOINT"),
		AIAPIKey:   os.Getenv("AI_API_KEY"),
		AIModel:    os.Getenv("AI_MODEL"),
	}
	suggesterService := llm.NewLLMSuggester(*llmConfig)

	llmModel, err := mistral.New(mistral.WithModel(llmConfig.AIModel), mistral.WithAPIKey(llmConfig.AIAPIKey))
	if err != nil {
		log.Fatal("unable to create LLM model ", zap.Error(err))
	}

	priceCheckerTool := llm.NewPriceCheckerTool(priceSvc)
	avaialbilityTool := llm.NewAvailabilityCheckerTool()
	llmTools := map[string]llm.LLMTools{
		priceCheckerTool.Name(): priceCheckerTool,
		avaialbilityTool.Name(): avaialbilityTool,
	}
	agentService := llm.NewLLMAgent(llmModel, llmTools)
	domainsearchv1.RegisterDomainSearchServiceServer(grpcServer, domainsearch.NewSearchService(suggesterService, agentService, priceSvc))

	grpcLis, err := net.Listen("tcp", *grpcAddr)
	if err != nil {
		log.Fatal("listen gRPC ", zap.Error(err))
	}
	go func() {
		log.Info("gRPC server listening on ", zap.String("gRPC Address", *grpcAddr))
		if err := grpcServer.Serve(grpcLis); err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			log.Fatal("gRPC server", zap.Error(err))
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
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Info("http shutdown", zap.Error(err))
		}
		grpcServer.GracefulStop()
	}()

	log.Info("UI available at http://localhost", zap.String("UI Address", *httpAddr))
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal("http server", zap.Error(err))
	}
}

func ensureDir(path string) error {
	info, err := os.Stat(path)
	if err == nil {
		if info.IsDir() {
			return nil
		}
		return fmt.Errorf("%s exists but is not a directory", path)
	}
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%s does not exist; build the front-end assets first", path)
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

func envOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
