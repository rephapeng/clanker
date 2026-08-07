package cmd

import (
	"strings"
	"testing"
)

func TestParseRouteDecision(t *testing.T) {
	cases := []struct {
		name    string
		raw     string
		agent   string
		wantErr bool
	}{
		{name: "plain json", raw: `{"agent":"maker","reason":"creates an instance"}`, agent: "maker"},
		{name: "fenced json", raw: "```json\n{\"agent\":\"k8s\",\"reason\":\"pod status\"}\n```", agent: "k8s"},
		{name: "prose around json", raw: "Sure! {\"agent\":\"CLI\",\"reason\":\"question\"} hope that helps", agent: "cli"},
		{name: "empty agent", raw: `{"agent":"","reason":"?"}`, wantErr: true},
		{name: "no json", raw: "route to maker", wantErr: true},
		{name: "broken json", raw: `{"agent":"maker",`, wantErr: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			parsed, err := parseRouteDecision(tc.raw)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %+v", parsed)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if parsed.Agent != tc.agent {
				t.Fatalf("agent = %q, want %q", parsed.Agent, tc.agent)
			}
		})
	}
}

// The classifier vocabulary must cover every agent the keyword router can emit —
// otherwise an LLM answer naming a legitimate agent silently loses to the fallback.
func TestRouteClassifierVocabularyMatchesKeywordRouter(t *testing.T) {
	keywordCases := map[string]string{
		"open the clanker cloud app":          "clanker-cloud",
		"talk to hermes":                      "hermes",
		"analyze my iam roles":                "iam",
		"show my terraform workspace drift":   "terraform",
		"draw a diagram of my vpc":            "diagram",
		"create a k8s deployment with 3 pods": "k8s-maker",
		"create an ec2 instance in us-east-1": "maker",
		"why is my k8s pod crashlooping":      "agent-observability",
		"what lambdas do we have":             "cli",
	}
	for question, want := range keywordCases {
		decision := determineRoutingDecisionDetailsWithContext(question, "")
		if decision.Agent != want {
			// The keyword router changed shape — update the map AND the classifier
			// prompt/vocabulary together.
			t.Fatalf("keyword router for %q = %q, want %q (vocabulary drift)", question, decision.Agent, want)
		}
		if !routeClassifierAgents[want] {
			t.Fatalf("agent %q missing from routeClassifierAgents", want)
		}
	}
	for agent := range routeClassifierAgents {
		if !strings.Contains(routeOnlySystemPrompt, "- "+agent+":") {
			t.Fatalf("routeOnlySystemPrompt does not describe agent %q", agent)
		}
	}
}

// The LLM path must fail closed to keyword routing: an unavailable provider (no key,
// no network call succeeds) returns ok=false rather than a junk decision.
func TestDetermineRoutingDecisionDetailsWithAIFailsClosed(t *testing.T) {
	_, ok := determineRoutingDecisionDetailsWithAI(
		t.Context(),
		"",
		"", "", "", "", "", "", "",
		false,
	)
	if ok {
		t.Fatal("empty question must not classify")
	}
}
