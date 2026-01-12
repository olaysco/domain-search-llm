package provider

import "context"

type PriceSearchProvider interface {
	// GetRegularPrice retrieves the single domain price from provider.
	GetDomainPrice(ctx context.Context, query string, currency string) ([]*Price, error)
}

// Price represents structure with price info.
type Price struct {
	// Promotion is promotion available.
	Promotion bool `json:"promotion"`
	// Cost is cost value.
	Cost float32 `json:"cost"`
	// Currency is the 3-letter currency code defined in ISO 4217.
	Currency string `json:"currency"`
	// Query is full query name.
	Query string `json:"query"`
	// Labels is array of domain labels.
	Labels []string `json:"labels"`
	// Availability is domain taken.
	Availability bool `json:"availability"`
}
