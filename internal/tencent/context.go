package tencent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	cdb "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cdb/v20170320"
	cvm "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cvm/v20170312"
	postgres "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/postgres/v20170312"
	vpc "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/vpc/v20170312"
	cos "github.com/tencentyun/cos-go-sdk-v5"
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
		{
			name: "MySQLInstances",
			keys: []string{"mysql", "cdb", "db", "database", "rds"},
			run:  func() (string, error) { return c.contextMySQL(ctx) },
		},
		{
			name: "PostgresInstances",
			keys: []string{"postgres", "postgresql", "pg", "db", "database", "rds"},
			run:  func() (string, error) { return c.contextPostgres(ctx) },
		},
		{
			name: "COSBuckets",
			keys: []string{"cos", "bucket", "buckets", "storage", "object", "s3"},
			run:  func() (string, error) { return c.contextCOS(ctx) },
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

func (c *Client) contextMySQL(ctx context.Context) (string, error) {
	client, err := newCDBClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := cdb.NewDescribeDBInstancesRequest()
	var offset, limit uint64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeDBInstances(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.Items) == 0 {
		return "", nil
	}
	type mysqlSummary struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Status      string `json:"status"`
		Engine      string `json:"engine"`
		MemoryMB    int64  `json:"memory_mb,omitempty"`
		VolumeGB    int64  `json:"volume_gb,omitempty"`
		Zone        string `json:"zone,omitempty"`
		PrivateIP   string `json:"private_ip,omitempty"`
		PrivatePort int64  `json:"private_port,omitempty"`
		PublicAddr  string `json:"public_addr,omitempty"`
	}
	var slim []mysqlSummary
	for _, i := range resp.Response.Items {
		s := mysqlSummary{
			ID:          derefStringRaw(i.InstanceId),
			Name:        derefStringRaw(i.InstanceName),
			Status:      mysqlStatus(i.Status),
			Engine:      derefStringRaw(i.EngineVersion),
			MemoryMB:    derefInt64Raw(i.Memory),
			VolumeGB:    derefInt64Raw(i.Volume),
			Zone:        derefStringRaw(i.Zone),
			PrivateIP:   derefStringRaw(i.Vip),
			PrivatePort: derefInt64Raw(i.Vport),
		}
		if i.WanStatus != nil && *i.WanStatus == 1 {
			s.PublicAddr = fmt.Sprintf("%s:%d", derefStringRaw(i.WanDomain), derefInt64Raw(i.WanPort))
		}
		slim = append(slim, s)
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextPostgres(ctx context.Context) (string, error) {
	client, err := newPostgresClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := postgres.NewDescribeDBInstancesRequest()
	var offset, limit uint64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeDBInstances(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.DBInstanceSet) == 0 {
		return "", nil
	}
	type pgSummary struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Status    string `json:"status"`
		Engine    string `json:"engine"`
		CPU       uint64 `json:"cpu,omitempty"`
		MemoryGB  uint64 `json:"memory_gb,omitempty"`
		StorageGB uint64 `json:"storage_gb,omitempty"`
		Zone      string `json:"zone,omitempty"`
		CreatedAt string `json:"created_at,omitempty"`
	}
	var slim []pgSummary
	for _, i := range resp.Response.DBInstanceSet {
		slim = append(slim, pgSummary{
			ID:        derefStringRaw(i.DBInstanceId),
			Name:      derefStringRaw(i.DBInstanceName),
			Status:    derefStringRaw(i.DBInstanceStatus),
			Engine:    derefStringRaw(i.DBVersion),
			CPU:       derefUint64Raw(i.DBInstanceCpu),
			MemoryGB:  derefUint64Raw(i.DBInstanceMemory),
			StorageGB: derefUint64Raw(i.DBInstanceStorage),
			Zone:      derefStringRaw(i.Zone),
			CreatedAt: derefStringRaw(i.CreateTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextCOS(ctx context.Context) (string, error) {
	client := cos.NewClient(nil, &http.Client{
		Timeout: 30 * time.Second,
		Transport: &cos.AuthorizationTransport{
			SecretID:  c.creds.SecretID,
			SecretKey: c.creds.SecretKey,
		},
	})
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	resp, _, err := client.Service.Get(cctx)
	if err != nil {
		return "", fmt.Errorf("cos service get: %w", err)
	}
	if resp == nil || len(resp.Buckets) == 0 {
		return "", nil
	}
	type bucketSummary struct {
		Name      string `json:"name"`
		Region    string `json:"region"`
		CreatedAt string `json:"created_at,omitempty"`
		Type      string `json:"type,omitempty"`
	}
	var slim []bucketSummary
	for _, b := range resp.Buckets {
		slim = append(slim, bucketSummary{
			Name:      b.Name,
			Region:    b.Region,
			CreatedAt: b.CreationDate,
			Type:      b.BucketType,
		})
	}
	out, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func derefInt64Raw(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

func derefUint64Raw(p *uint64) uint64 {
	if p == nil {
		return 0
	}
	return *p
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
