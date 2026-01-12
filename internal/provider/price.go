package provider

import (
	"context"
	"fmt"
	"io"
	"strings"

	domainsearchv1 "github.com/olaysco/domain-search-llm/internal/gen/domainsearch/v1"
	pricepb "github.com/openprovider/contracts/v2/product/price"
	"golang.org/x/net/publicsuffix"
)

// PriceStreamHandler is invoked for each SearchPricesResponse returned by the upstream service.
type PriceStreamHandler func(*domainsearchv1.SearchPricesResponse) error

// PriceProvider exposes a uniform interface for streaming product prices from different vendors.
type PriceProvider interface {
	StreamPrices(ctx context.Context, req string, handler PriceStreamHandler) error
}

// PriceService implements PriceProvider on top of the Openprovider PriceService gRPC API.
type PriceService struct {
	client pricepb.PriceServiceClient
}

// NewPriceService wires the external PriceService client into our provider abstraction.
func NewPriceService(client pricepb.PriceServiceClient) *PriceService {
	return &PriceService{client: client}
}

// StreamPrices forwards the request to the upstream gRPC service and relays every streamed response
// to the provided handler. The handler is invoked synchronously for each incoming message.
func (p *PriceService) StreamPrices(ctx context.Context, req string, handler PriceStreamHandler) error {
	if handler == nil {
		return fmt.Errorf("price stream handler cannot be nil")
	}

	stream, err := p.client.SearchPriceFastCheckout(ctx, toPriceSearchRequest(req))
	if err != nil {
		return fmt.Errorf("price service search: %w", err)
	}

	for {
		msg, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return fmt.Errorf("price service stream recv: %w", err)
		}

		if resp := fromPriceSearchResponse(req, msg); resp != nil {
			if err := handler(resp); err != nil {
				return err
			}
		}
	}
}

func toPriceSearchRequest(req string) *pricepb.SearchPricesRequest {
	if req == "" {
		return nil
	}
	domain, tld := extractTLD(req)
	return &pricepb.SearchPricesRequest{
		Product:      "domain",
		Query:        domain,
		CurrencyCode: "USD",
		Filter: &pricepb.PriceFilter{
			Product: &pricepb.PriceFilter_Domain{
				Domain: &pricepb.DomainPriceFilter{
					TldFilter: &pricepb.DomainPriceFilter_IncludedTldNames{
						IncludedTldNames: tld,
					},
				},
			},
		},
	}
}

func fromPriceSearchResponse(req string, resp *pricepb.SearchPricesResponse) *domainsearchv1.SearchPricesResponse {
	if resp == nil {
		return nil
	}
	out := &domainsearchv1.SearchPricesResponse{Domain: req}
	switch payload := resp.GetResponse().(type) {
	case *pricepb.SearchPricesResponse_Price:
		out.Response = &domainsearchv1.SearchPricesResponse_Price{Price: fromPriceData(payload.Price)}
	case *pricepb.SearchPricesResponse_Error:
		out.Response = &domainsearchv1.SearchPricesResponse_Error{Error: payload.Error}
	}
	return out
}

func fromPriceData(data *pricepb.PriceData) *domainsearchv1.PriceData {
	if data == nil {
		return nil
	}
	prices := make(map[string]*domainsearchv1.ProductPrice, len(data.Prices))
	for key, value := range data.Prices {
		prices[key] = fromProductPrice(value)
	}
	return &domainsearchv1.PriceData{Prices: prices}
}

func fromProductPrice(price *pricepb.ProductPrice) *domainsearchv1.ProductPrice {
	if price == nil {
		return nil
	}
	return &domainsearchv1.ProductPrice{
		Price:     fromPrice(price.Price),
		Promotion: fromPromotion(price.Promotion),
		Labels:    append([]string(nil), price.Labels...),
	}
}

func fromPrice(price *pricepb.Price) *domainsearchv1.Price {
	if price == nil {
		return nil
	}
	return &domainsearchv1.Price{
		CurrencyCode: price.GetCurrencyCode(),
		Value:        price.GetValue(),
	}
}

func fromPromotion(promo *pricepb.Promotion) *domainsearchv1.Promotion {
	if promo == nil {
		return nil
	}
	return &domainsearchv1.Promotion{Period: fromPromotionPeriod(promo.Period)}
}

func fromPromotionPeriod(period *pricepb.PromotionPeriod) *domainsearchv1.PromotionPeriod {
	if period == nil {
		return nil
	}
	return &domainsearchv1.PromotionPeriod{From: period.GetFrom(), To: period.GetTo()}
}

func extractTLD(domain string) (string, string) {
	clean := strings.TrimSpace(domain)
	clean = strings.ToLower(clean)
	if clean == "" {
		return "", ""
	}
	suffix, _ := publicsuffix.PublicSuffix(clean)
	if suffix == "" {
		return fallbackSplit(clean)
	}

	remainder := strings.TrimSuffix(clean, suffix)
	remainder = strings.TrimRight(remainder, ".")
	if idx := strings.LastIndex(remainder, "."); idx != -1 {
		remainder = remainder[idx+1:]
	}
	if remainder == "" {
		return "", suffix
	}

	return remainder, suffix
}

// fallbackSplit splits the domain using the last dot when publicsuffix cannot help.
func fallbackSplit(domain string) (string, string) {
	if idx := strings.LastIndex(domain, "."); idx > 0 && idx < len(domain)-1 {
		return domain[:idx], domain[idx+1:]
	}
	return domain, ""
}
