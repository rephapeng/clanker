package ai

import "testing"

func TestNormalizeGitHubModelsModel(t *testing.T) {
	cases := map[string]string{
		"":                      "",
		"  ":                    "",
		"openai/gpt-5.4":        "openai/gpt-5.4",
		"gpt-5.4":               "openai/gpt-5.4",
		"claude-sonnet-5":       "anthropic/claude-sonnet-5",
		"gemini-2.5-flash":      "google/gemini-2.5-flash",
		"mistral-large":         "mistral-large",
		"meta/llama-4-maverick": "meta/llama-4-maverick",
	}
	for raw, want := range cases {
		if got := normalizeGitHubModelsModel(raw); got != want {
			t.Fatalf("normalizeGitHubModelsModel(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestPickGitHubCatalogModel(t *testing.T) {
	catalog := []gitHubCatalogModel{
		{ID: "vision/only", SupportedInputModalities: []string{"image"}, SupportedOutputModalities: []string{"text"}},
		{ID: "  "},
		{ID: "openai/gpt-5.4", SupportedInputModalities: []string{"text", "image"}, SupportedOutputModalities: []string{"text"}},
	}
	got, err := pickGitHubCatalogModel(catalog)
	if err != nil || got != "openai/gpt-5.4" {
		t.Fatalf("pick = %q, %v; want the first text-in/text-out model", got, err)
	}

	// No text-capable model: fall back to the first non-empty id rather than failing.
	fallbackOnly := []gitHubCatalogModel{{ID: "vision/only", SupportedInputModalities: []string{"image"}}}
	got, err = pickGitHubCatalogModel(fallbackOnly)
	if err != nil || got != "vision/only" {
		t.Fatalf("fallback pick = %q, %v", got, err)
	}

	if _, err := pickGitHubCatalogModel(nil); err == nil {
		t.Fatal("empty catalog must error")
	}
}
