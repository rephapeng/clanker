package tencent

import (
	"context"
	"encoding/json"
	"fmt"

	vpc "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/vpc/v20170312"
)

// Public JSON-emitting methods on Client. These are the canonical data
// sources for the HTTP API layer (internal/api/) — they wrap the same SDK
// calls as the CLI list commands but return JSON-encoded summaries instead of
// printing tables.
//
// Each method returns the raw JSON string for a single-typed array of
// resources (or an empty string when no resources exist). Callers that wrap
// the result for HTTP should embed it inside an envelope like
// {"data": <result>} rather than re-encoding.

func (c *Client) JSONCVMs(ctx context.Context) (string, error)             { return c.contextCVMs(ctx) }
func (c *Client) JSONVPCs(ctx context.Context) (string, error)             { return c.contextVPCs(ctx) }
func (c *Client) JSONSecurityGroups(ctx context.Context) (string, error)   { return c.contextSecurityGroups(ctx) }
func (c *Client) JSONMySQL(ctx context.Context) (string, error)            { return c.contextMySQL(ctx) }
func (c *Client) JSONPostgres(ctx context.Context) (string, error)         { return c.contextPostgres(ctx) }
func (c *Client) JSONCOS(ctx context.Context) (string, error)              { return c.contextCOS(ctx) }
func (c *Client) JSONTKE(ctx context.Context) (string, error)              { return c.contextTKE(ctx) }

// JSONSGRules returns the ingress + egress policies of a single security
// group plus a `risk` label on each ingress rule that exposes a sensitive
// port to the public internet. Wraps DescribeSecurityGroupPolicies.
func (c *Client) JSONSGRules(ctx context.Context, sgID string) (string, error) {
	client, err := c.VPC()
	if err != nil {
		return "", fmt.Errorf("init vpc client: %w", err)
	}
	req := vpc.NewDescribeSecurityGroupPoliciesRequest()
	req.SecurityGroupId = &sgID
	resp, err := client.DescribeSecurityGroupPolicies(req)
	if err != nil {
		return "", friendlyError(err)
	}
	type rule struct {
		Direction   string `json:"direction"`
		Index       int64  `json:"index"`
		Protocol    string `json:"protocol,omitempty"`
		Port        string `json:"port,omitempty"`
		Source      string `json:"source,omitempty"`
		Action      string `json:"action"`
		Description string `json:"description,omitempty"`
		Risk        string `json:"risk,omitempty"`
	}
	var rows []rule
	risky := 0
	if resp != nil && resp.Response != nil && resp.Response.SecurityGroupPolicySet != nil {
		for _, p := range resp.Response.SecurityGroupPolicySet.Ingress {
			r := buildRule("INGRESS", p, classifySGRule(p, true))
			if r.Risk != "" {
				risky++
			}
			rows = append(rows, r)
		}
		for _, p := range resp.Response.SecurityGroupPolicySet.Egress {
			rows = append(rows, buildRule("EGRESS", p, classifySGRule(p, false)))
		}
	}
	out := map[string]interface{}{
		"sg_id":       sgID,
		"region":      c.Region(),
		"rules":       rows,
		"risky_count": risky,
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// FetchKubeconfig retrieves a TKE cluster's kubeconfig. Used by the HTTP API
// layer; the CLI uses getTKEKubeconfig directly so it can print to stdout.
func (c *Client) FetchKubeconfig(ctx context.Context, clusterID string, public bool) (string, error) {
	client, err := newTKEClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := newDescribeKubeconfigReq(clusterID, public)
	resp, err := client.DescribeClusterKubeconfig(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || resp.Response.Kubeconfig == nil {
		return "", fmt.Errorf("empty kubeconfig response for %s", clusterID)
	}
	return *resp.Response.Kubeconfig, nil
}

func buildRule(dir string, p *vpc.SecurityGroupPolicy, risk string) struct {
	Direction   string `json:"direction"`
	Index       int64  `json:"index"`
	Protocol    string `json:"protocol,omitempty"`
	Port        string `json:"port,omitempty"`
	Source      string `json:"source,omitempty"`
	Action      string `json:"action"`
	Description string `json:"description,omitempty"`
	Risk        string `json:"risk,omitempty"`
} {
	idx := int64(0)
	if p != nil && p.PolicyIndex != nil {
		idx = *p.PolicyIndex
	}
	source := derefStringRaw(p.CidrBlock)
	if source == "" {
		source = derefStringRaw(p.Ipv6CidrBlock)
	}
	if source == "" && p.SecurityGroupId != nil {
		source = "sg:" + *p.SecurityGroupId
	}
	return struct {
		Direction   string `json:"direction"`
		Index       int64  `json:"index"`
		Protocol    string `json:"protocol,omitempty"`
		Port        string `json:"port,omitempty"`
		Source      string `json:"source,omitempty"`
		Action      string `json:"action"`
		Description string `json:"description,omitempty"`
		Risk        string `json:"risk,omitempty"`
	}{
		Direction:   dir,
		Index:       idx,
		Protocol:    derefStringRaw(p.Protocol),
		Port:        derefStringRaw(p.Port),
		Source:      source,
		Action:      derefStringRaw(p.Action),
		Description: derefStringRaw(p.PolicyDescription),
		Risk:        risk,
	}
}
