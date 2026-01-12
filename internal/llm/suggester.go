package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Config - you can load this from env or config file
type Config struct {
	AIEndpoint string // e.g. "https://api.groq.com/openai/v1" or "https://api.openai.com/v1"
	AIAPIKey   string
	AIModel    string // e.g. "llama-3.1-70b-versatile", "gpt-4o-mini", "mistral-large"
}

type AISuggestionRequest struct {
	Query      string                 `json:"query"`
	MaxResults int                    `json:"max_results"`
	Context    map[string]interface{} `json:"context,omitempty"`
}

type DomainSuggestion struct {
	Domain string  `json:"domain"`
	Score  float64 `json:"relevance_score,omitempty"`
}

type LLMSuggester struct {
	cfg    *Config
	client *http.Client
}

func NewLLMSuggester(cfg Config) *LLMSuggester {
	client := &http.Client{
		Timeout: 60 * time.Second,
	}
	return &LLMSuggester{cfg: &cfg, client: client}
}

// generateDomainSuggestions calls LLM to get creative domain ideas
func (ls *LLMSuggester) GenerateDomainSuggestions(ctx context.Context, req AISuggestionRequest) ([]DomainSuggestion, error) {
	prompt := ls.BuildDomainPrompt(req)
	cfg := ls.cfg

	payload := map[string]interface{}{
		"model": cfg.AIModel,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a creative domain name expert."},
			{"role": "user", "content": prompt},
		},
		"temperature": 0.7,
	}

	bodyBytes, _ := json.Marshal(payload)

	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		cfg.AIEndpoint+"/chat/completions",
		bytes.NewReader(bodyBytes))

	httpReq.Header.Set("Authorization", "Bearer "+cfg.AIAPIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LLM error %d: %s", resp.StatusCode, string(body))
	}

	var llmResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(body, &llmResp); err != nil {
		return nil, err
	}

	if len(llmResp.Choices) == 0 {
		return nil, fmt.Errorf("no response from LLM")
	}

	// Parse the JSON array from LLM response
	var domains []string
	if err := json.Unmarshal([]byte(llmResp.Choices[0].Message.Content), &domains); err != nil {
		return nil, fmt.Errorf("failed to parse LLM domains JSON: %w", err)
	}

	result := make([]DomainSuggestion, 0, len(domains))
	for _, d := range domains {
		result = append(result, DomainSuggestion{
			Domain: d,
			Score:  0.85 + float64(len(result))/float64(len(domains))*0.1, // dummy score
		})
	}

	return result, nil
}

func (ls *LLMSuggester) BuildDomainPrompt(req AISuggestionRequest) string {
	prefTLDs := stringFromContext(req.Context, "preferred_tlds")
	exclTLDs := stringFromContext(req.Context, "excluded_tlds")
	keywords := stringFromContext(req.Context, "brand_keywords")
	businessType := stringFromContext(req.Context, "business_type")
	location := stringFromContext(req.Context, "location")

	contextLines := make([]string, 0, 5)
	if prefTLDs != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Preferred TLDs: %s", prefTLDs))
	}
	if exclTLDs != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Excluded TLDs: %s", exclTLDs))
	}
	contextLines = append(contextLines, fmt.Sprintf("- Business type: %s", businessType))
	if location != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Location focus: %s", location))
	}
	if keywords != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Brand keywords to include: %s", keywords))
	}

	contextSection := strings.Join(contextLines, "\n")

	return fmt.Sprintf(`
You are an expert creative domain name generator for Openprovider.

Generate 12 excellent brandable domain names for: "%s"

Context:
%s

Rules:
- Short, memorable, easy to spell
- Relevant niche TLDs
- Brandable > exact keyword match
- Return ONLY valid JSON array of full domains

Output format:
["domain1.com", "domain2.io", ...]
`, req.Query, contextSection)
}

func stringFromContext(ctx map[string]interface{}, key string) string {
	if ctx == nil {
		return ""
	}
	if val, ok := ctx[key]; ok {
		if s, ok := val.(string); ok {
			return s
		}
	}
	return ""
}
