package llm

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"sync"

	domainsearchv1 "github.com/olaysco/domain-search-llm/internal/gen/domainsearch/v1"
	"github.com/olaysco/domain-search-llm/internal/provider"
	"github.com/tmc/langchaingo/llms"
)

type PriceCheckerTool struct {
	provider provider.PriceProvider
}

func NewPriceCheckerTool(provider provider.PriceProvider) *PriceCheckerTool {
	return &PriceCheckerTool{
		provider,
	}
}

func (pct *PriceCheckerTool) Call(ctx context.Context, domain string) (string, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(1)

	respCh := make(chan *domainsearchv1.Price, 1)
	errCh := make(chan error, 1)

	go func() {
		defer wg.Done()
		err := pct.provider.StreamPrices(ctx, domain, func(resp *domainsearchv1.SearchPricesResponse) error {
			if resp == nil {
				return nil
			}
			if price := resp.GetPrice(); price != nil {
				respCh <- price
			}
			return nil
		})
		if err != nil && !errors.Is(err, context.Canceled) {
			select {
			case errCh <- err:
			default:
			}
			cancel()
		}

	}()

	wg.Wait()
	select {
	case respn := <-respCh:
		return strconv.FormatFloat(float64(respn.Cost), 'f', 2, 32), nil
	case err := <-errCh:
		fmt.Println(err)
		return "0", err
	default:
		return "0", fmt.Errorf("unable to fetch price for %s", domain)
	}
}

func (pct *PriceCheckerTool) Name() string {
	return "price_checker_tool"
}

func (pct *PriceCheckerTool) Description() string {
	return "This is a service that is able to perform price check for a domain"
}

func (pct *PriceCheckerTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name": map[string]any{
				"type":        "string",
				"description": "The full domain name and tld to get price for, e.g. escobar.com",
			},
		},
		"required": []string{"name"},
	}
}

func (pct *PriceCheckerTool) Definition() llms.Tool {
	return llms.Tool{
		Type: "Function",
		Function: &llms.FunctionDefinition{
			Name:        pct.Name(),
			Description: pct.Description(),
			Parameters:  pct.Parameters(),
		},
	}
}
