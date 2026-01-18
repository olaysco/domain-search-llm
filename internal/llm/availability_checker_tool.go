package llm

import (
	"context"
	"fmt"
	"net/http"

	"github.com/tmc/langchaingo/llms"
)

type AvailablityCheckerTool struct {
	client *http.Client
}

func NewAvailabilityCheckerTool() *AvailablityCheckerTool {
	return &AvailablityCheckerTool{
		client: http.DefaultClient,
	}
}

func (pct *AvailablityCheckerTool) Call(ctx context.Context, domain string) (string, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	url := fmt.Sprintf("https://rdap.verisign.com/com/v1/domain/%s", domain)
	resp, err := pct.client.Get(url)

	if err != nil {
		return "true", nil
	}

	if resp.StatusCode == 200 {
		return "false", nil
	}

	return "true", nil
}

func (pct *AvailablityCheckerTool) Name() string {
	return "availability_checker_tool"
}

func (pct *AvailablityCheckerTool) Description() string {
	return "This is a service that is able to check the availability of a domain"
}

func (pct *AvailablityCheckerTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name": map[string]any{
				"type":        "string",
				"description": "The full domain name and tld to check availablity for, e.g. escobar.com",
			},
		},
		"required": []string{"name"},
	}
}

func (pct *AvailablityCheckerTool) Definition() llms.Tool {
	return llms.Tool{
		Type: "Function",
		Function: &llms.FunctionDefinition{
			Name:        pct.Name(),
			Description: pct.Description(),
			Parameters:  pct.Parameters(),
		},
	}
}
