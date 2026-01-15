package client

import (
	"crypto/tls"
	"fmt"
	"strings"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

type Config struct {
	Target             string
	ServerName         string
	Insecure           bool
	WaitForReady       bool
	InsecureSkipVerify bool
}

func New(cfg *Config) (*grpc.ClientConn, error) {
	if cfg == nil {
		return nil, fmt.Errorf("grpc client config is nil")
	}
	if strings.TrimSpace(cfg.Target) == "" {
		return nil, fmt.Errorf("grpc client target is required")
	}

	return grpc.NewClient(cfg.Target, DialOptions(cfg)...)
}

func DialOptions(cfg *Config, opts ...grpc.DialOption) []grpc.DialOption {
	tlsCfg := &tls.Config{}
	if cfg.ServerName != "" {
		tlsCfg.ServerName = cfg.ServerName
	}

	tlsOption := grpc.WithTransportCredentials(credentials.NewTLS(tlsCfg))
	if cfg.Insecure {
		tlsOption = grpc.WithInsecure()
	} else if cfg.InsecureSkipVerify {
		tlsOption = grpc.WithTransportCredentials(credentials.NewTLS(
			&tls.Config{
				InsecureSkipVerify: true,
			},
		))
	}

	return append(opts,
		tlsOption,
		grpc.WithDefaultCallOptions(
			grpc.WaitForReady(cfg.WaitForReady),
		),
	)
}
