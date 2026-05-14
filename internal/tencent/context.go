package tencent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	cvm "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cvm/v20170312"
	vpc "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/vpc/v20170312"
)

// GetRelevantContext gathers Tencent Cloud inventory data shaped for inclusion
// in an LLM prompt. The question is used as a coarse keyword filter — only
// resource types that look relevant are fetched, with CVMs always included.
//
// Returns a multi-section text blob. Errors per section are collected as
// warnings rather than aborting the whole gather; the LLM is better off with
// partial context than nothing.
func (c *Client) GetRelevantContext(ctx context.Context, question string) (string, error) {
	q := strings.ToLower(strings.TrimSpace(question))

	type section struct {
		name string
		keys []string
		run  func() (string, error)
	}

	sections := []section{
		{
			name: "CVMInstances",
			keys: nil, // always include
			run:  func() (string, error) { return c.contextCVMs(ctx) },
		},
		{
			name: "VPCs",
			keys: []string{"vpc", "network", "subnet", "cidr"},
			run:  func() (string, error) { return c.contextVPCs(ctx) },
		},
		{
			name: "SecurityGroups",
			keys: []string{"security", "firewall", "sg", "port", "expose", "public", "risky", "audit"},
			run:  func() (string, error) { return c.contextSecurityGroups(ctx) },
		},
	}

	var out strings.Builder
	out.WriteString(fmt.Sprintf("Region: %s\n\n", c.Region()))

	var warnings []string
	for _, s := range sections {
		if len(s.keys) > 0 && q != "" {
			matched := false
			for _, k := range s.keys {
				if strings.Contains(q, k) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		body, err := s.run()
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("%s: %v", s.name, err))
			continue
		}
		if strings.TrimSpace(body) == "" {
			continue
		}
		out.WriteString(s.name)
		out.WriteString(":\n")
		out.WriteString(body)
		out.WriteString("\n\n")
	}

	if len(warnings) > 0 {
		out.WriteString("Warnings:\n")
		for _, w := range warnings {
			out.WriteString("- ")
			out.WriteString(w)
			out.WriteString("\n")
		}
	}

	if strings.TrimSpace(out.String()) == "" {
		return "No Tencent Cloud data available in this region.", nil
	}
	return out.String(), nil
}

// contextCVMs returns a compact JSON array of CVMs in this client's region.
// JSON keeps the LLM's parser happy while remaining token-efficient compared
// to the verbose SDK struct.
func (c *Client) contextCVMs(ctx context.Context) (string, error) {
	client, err := c.CVM()
	if err != nil {
		return "", err
	}
	req := cvm.NewDescribeInstancesRequest()
	resp, err := client.DescribeInstances(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.InstanceSet) == 0 {
		return "", nil
	}

	type instSummary struct {
		ID        string   `json:"id"`
		Name      string   `json:"name"`
		State     string   `json:"state"`
		Type      string   `json:"type"`
		Zone      string   `json:"zone"`
		PrivateIP []string `json:"private_ip,omitempty"`
		PublicIP  []string `json:"public_ip,omitempty"`
		CreatedAt string   `json:"created_at,omitempty"`
		OSName    string   `json:"os,omitempty"`
	}
	var slim []instSummary
	for _, in := range resp.Response.InstanceSet {
		slim = append(slim, instSummary{
			ID:        derefStringRaw(in.InstanceId),
			Name:      derefStringRaw(in.InstanceName),
			State:     derefStringRaw(in.InstanceState),
			Type:      derefStringRaw(in.InstanceType),
			Zone:      derefStringRaw(in.Placement.Zone),
			PrivateIP: stringSlice(in.PrivateIpAddresses),
			PublicIP:  stringSlice(in.PublicIpAddresses),
			CreatedAt: derefStringRaw(in.CreatedTime),
			OSName:    derefStringRaw(in.OsName),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextVPCs(ctx context.Context) (string, error) {
	client, err := c.VPC()
	if err != nil {
		return "", err
	}
	req := vpc.NewDescribeVpcsRequest()
	resp, err := client.DescribeVpcs(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.VpcSet) == 0 {
		return "", nil
	}
	type vpcSummary struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		CIDR      string `json:"cidr"`
		IsDefault bool   `json:"is_default"`
		CreatedAt string `json:"created_at,omitempty"`
	}
	var slim []vpcSummary
	for _, v := range resp.Response.VpcSet {
		slim = append(slim, vpcSummary{
			ID:        derefStringRaw(v.VpcId),
			Name:      derefStringRaw(v.VpcName),
			CIDR:      derefStringRaw(v.CidrBlock),
			IsDefault: derefBool(v.IsDefault),
			CreatedAt: derefStringRaw(v.CreatedTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextSecurityGroups(ctx context.Context) (string, error) {
	client, err := c.VPC()
	if err != nil {
		return "", err
	}
	req := vpc.NewDescribeSecurityGroupsRequest()
	resp, err := client.DescribeSecurityGroups(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.SecurityGroupSet) == 0 {
		return "", nil
	}
	type sgSummary struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
		IsDefault   bool   `json:"is_default"`
	}
	var slim []sgSummary
	for _, g := range resp.Response.SecurityGroupSet {
		slim = append(slim, sgSummary{
			ID:          derefStringRaw(g.SecurityGroupId),
			Name:        derefStringRaw(g.SecurityGroupName),
			Description: derefStringRaw(g.SecurityGroupDesc),
			IsDefault:   derefBool(g.IsDefault),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// derefStringRaw returns the raw pointer value or empty string — used by
// context builders that want JSON omitempty to actually drop empties (the
// table renderer's "-" placeholder would defeat that).
func derefStringRaw(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}

func stringSlice(ptrs []*string) []string {
	if len(ptrs) == 0 {
		return nil
	}
	out := make([]string, 0, len(ptrs))
	for _, p := range ptrs {
		if p != nil && *p != "" {
			out = append(out, *p)
		}
	}
	return out
}
