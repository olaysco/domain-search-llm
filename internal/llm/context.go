package llm

import (
	"fmt"
	"strings"
)

// ContextFields extracts and formats context fields for domain generation prompts
type ContextFields struct {
	PreferredTLDs string
	ExcludedTLDs  string
	BrandKeywords string
	BusinessType  string
	Location      string
}

// ExtractContextFields pulls known context fields from the context map
func ExtractContextFields(ctx map[string]interface{}) ContextFields {
	return ContextFields{
		PreferredTLDs: stringFromContext(ctx, "preferred_tlds"),
		ExcludedTLDs:  stringFromContext(ctx, "excluded_tlds"),
		BrandKeywords: stringFromContext(ctx, "brand_keywords"),
		BusinessType:  stringFromContext(ctx, "business_type"),
		Location:      stringFromContext(ctx, "location"),
	}
}

// FormatContextSection formats context fields into a readable section for prompts
func (cf *ContextFields) FormatContextSection() string {
	contextLines := make([]string, 0, 5)

	if cf.PreferredTLDs != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Preferred TLDs: %s", cf.PreferredTLDs))
	}
	if cf.ExcludedTLDs != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Excluded TLDs: %s", cf.ExcludedTLDs))
	}
	if cf.BusinessType != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Business type: %s", cf.BusinessType))
	}
	if cf.Location != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Location focus: %s", cf.Location))
	}
	if cf.BrandKeywords != "" {
		contextLines = append(contextLines, fmt.Sprintf("- Brand keywords to include: %s", cf.BrandKeywords))
	}

	if len(contextLines) == 0 {
		return "- No additional constraints were provided."
	}

	return strings.Join(contextLines, "\n")
}

// HasContext returns true if any context fields are set
func (cf *ContextFields) HasContext() bool {
	return cf.PreferredTLDs != "" ||
		cf.ExcludedTLDs != "" ||
		cf.BrandKeywords != "" ||
		cf.BusinessType != "" ||
		cf.Location != ""
}

// stringFromContext safely extracts a string value from a context map
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
