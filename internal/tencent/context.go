package tencent

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	cdb "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cdb/v20170320"
	ssl "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/ssl/v20191205"
	cam "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cam/v20190116"
	cbs "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cbs/v20170312"
	clb "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/clb/v20180317"
	cvm "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cvm/v20170312"
	postgres "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/postgres/v20170312"
	tke "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/tke/v20180525"
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
		{
			name: "TKEClusters",
			keys: []string{"tke", "kubernetes", "k8s", "cluster", "clusters", "pod", "node"},
			run:  func() (string, error) { return c.contextTKE(ctx) },
		},
		{
			name: "CLBs",
			keys: []string{"clb", "load", "balancer", "lb"},
			run:  func() (string, error) { return c.contextCLB(ctx) },
		},
		{
			name: "EIPs",
			keys: []string{"eip", "public", "address", "ip"},
			run:  func() (string, error) { return c.contextEIP(ctx) },
		},
		{
			name: "CBSVolumes",
			keys: []string{"cbs", "disk", "volume", "storage", "encrypted"},
			run:  func() (string, error) { return c.contextCBS(ctx) },
		},
		{
			name: "SSLCertificates",
			keys: []string{"ssl", "cert", "tls", "https", "expiry"},
			run:  func() (string, error) { return c.contextSSL(ctx) },
		},
		{
			name: "CAMUsers",
			keys: []string{"cam", "iam", "user", "subaccount", "mfa", "identity"},
			run:  func() (string, error) { return c.contextCAM(ctx) },
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

func (c *Client) contextTKE(ctx context.Context) (string, error) {
	client, err := newTKEClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := tke.NewDescribeClustersRequest()
	var offset, limit int64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeClusters(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.Clusters) == 0 {
		return "", nil
	}
	type tkeSummary struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		Status   string `json:"status"`
		Version  string `json:"k8s_version"`
		Type     string `json:"type"`
		NodeNum  uint64 `json:"node_num,omitempty"`
		VpcID    string `json:"vpc_id,omitempty"`
		Created  string `json:"created_at,omitempty"`
	}
	var slim []tkeSummary
	for _, cl := range resp.Response.Clusters {
		vpcID := ""
		if cl.ClusterNetworkSettings != nil && cl.ClusterNetworkSettings.VpcId != nil {
			vpcID = *cl.ClusterNetworkSettings.VpcId
		}
		slim = append(slim, tkeSummary{
			ID:      derefStringRaw(cl.ClusterId),
			Name:    derefStringRaw(cl.ClusterName),
			Status:  derefStringRaw(cl.ClusterStatus),
			Version: derefStringRaw(cl.ClusterVersion),
			Type:    derefStringRaw(cl.ClusterType),
			NodeNum: derefUint64Raw(cl.ClusterNodeNum),
			VpcID:   vpcID,
			Created: derefStringRaw(cl.CreatedTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
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

// Append to internal/tencent/context.go via the patcher. These reuse the
// existing region-scoped client from c, mirror the slim JSON shape we use
// for other resource types, and surface only the columns the dashboard or
// LLM cares about.

func (c *Client) contextCLB(ctx context.Context) (string, error) {
	client, err := newCLBClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := clb.NewDescribeLoadBalancersRequest()
	var offset, limit int64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeLoadBalancers(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.LoadBalancerSet) == 0 {
		return "", nil
	}
	type lbSummary struct {
		ID      string   `json:"id"`
		Name    string   `json:"name"`
		Type    string   `json:"type"`
		Status  string   `json:"status"`
		VIPs    []string `json:"vips,omitempty"`
		VpcID   string   `json:"vpc_id,omitempty"`
		Created string   `json:"created_at,omitempty"`
	}
	var slim []lbSummary
	for _, lb := range resp.Response.LoadBalancerSet {
		slim = append(slim, lbSummary{
			ID:      derefStringRaw(lb.LoadBalancerId),
			Name:    derefStringRaw(lb.LoadBalancerName),
			Type:    derefStringRaw(lb.LoadBalancerType),
			Status:  clbStatus(lb.Status),
			VIPs:    stringSlice(lb.LoadBalancerVips),
			VpcID:   derefStringRaw(lb.VpcId),
			Created: derefStringRaw(lb.CreateTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextEIP(ctx context.Context) (string, error) {
	client, err := c.VPC()
	if err != nil {
		return "", err
	}
	req := vpc.NewDescribeAddressesRequest()
	var offset, limit int64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeAddresses(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.AddressSet) == 0 {
		return "", nil
	}
	type eipSummary struct {
		ID         string `json:"id"`
		Name       string `json:"name,omitempty"`
		IP         string `json:"ip"`
		Status     string `json:"status"`
		Type       string `json:"type,omitempty"`
		InstanceID string `json:"instance_id,omitempty"`
		Created    string `json:"created_at,omitempty"`
	}
	var slim []eipSummary
	for _, a := range resp.Response.AddressSet {
		slim = append(slim, eipSummary{
			ID:         derefStringRaw(a.AddressId),
			Name:       derefStringRaw(a.AddressName),
			IP:         derefStringRaw(a.AddressIp),
			Status:     derefStringRaw(a.AddressStatus),
			Type:       derefStringRaw(a.AddressType),
			InstanceID: derefStringRaw(a.InstanceId),
			Created:    derefStringRaw(a.CreatedTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextCBS(ctx context.Context) (string, error) {
	client, err := newCBSClient(c, c.creds.Region)
	if err != nil {
		return "", err
	}
	req := cbs.NewDescribeDisksRequest()
	var offset, limit uint64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeDisks(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.DiskSet) == 0 {
		return "", nil
	}
	type diskSummary struct {
		ID         string `json:"id"`
		Name       string `json:"name,omitempty"`
		Type       string `json:"type"`
		SizeGB     uint64 `json:"size_gb"`
		State      string `json:"state"`
		Encrypted  bool   `json:"encrypted"`
		InstanceID string `json:"instance_id,omitempty"`
		Zone       string `json:"zone,omitempty"`
	}
	var slim []diskSummary
	for _, d := range resp.Response.DiskSet {
		zone := ""
		if d.Placement != nil {
			zone = derefStringRaw(d.Placement.Zone)
		}
		slim = append(slim, diskSummary{
			ID:         derefStringRaw(d.DiskId),
			Name:       derefStringRaw(d.DiskName),
			Type:       derefStringRaw(d.DiskType),
			SizeGB:     derefUint64Raw(d.DiskSize),
			State:      derefStringRaw(d.DiskState),
			Encrypted:  derefBool(d.Encrypt),
			InstanceID: derefStringRaw(d.InstanceId),
			Zone:       zone,
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextSSL(ctx context.Context) (string, error) {
	client, err := newSSLClient(c)
	if err != nil {
		return "", err
	}
	req := ssl.NewDescribeCertificatesRequest()
	var offset, limit uint64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit
	resp, err := client.DescribeCertificates(req)
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.Certificates) == 0 {
		return "", nil
	}
	type certSummary struct {
		ID         string `json:"id"`
		Alias      string `json:"alias,omitempty"`
		Domain     string `json:"domain,omitempty"`
		Status     string `json:"status"`
		From       string `json:"from,omitempty"`
		CertEnd    string `json:"cert_end,omitempty"`
		DaysLeft   int    `json:"days_left"`
	}
	var slim []certSummary
	for _, cert := range resp.Response.Certificates {
		slim = append(slim, certSummary{
			ID:       derefStringRaw(cert.CertificateId),
			Alias:    derefStringRaw(cert.Alias),
			Domain:   derefStringRaw(cert.Domain),
			Status:   sslStatus(cert.Status),
			From:     derefStringRaw(cert.From),
			CertEnd:  derefStringRaw(cert.CertEndTime),
			DaysLeft: daysUntilExpiry(cert.CertEndTime),
		})
	}
	b, err := json.Marshal(slim)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (c *Client) contextCAM(ctx context.Context) (string, error) {
	client, err := newCAMClient(c)
	if err != nil {
		return "", err
	}
	resp, err := client.ListUsers(cam.NewListUsersRequest())
	if err != nil {
		return "", friendlyError(err)
	}
	if resp == nil || resp.Response == nil || len(resp.Response.Data) == 0 {
		return "", nil
	}
	type userSummary struct {
		UID          uint64 `json:"uid"`
		Name         string `json:"name"`
		NickName     string `json:"nickname,omitempty"`
		Email        string `json:"email,omitempty"`
		ConsoleLogin bool   `json:"console_login"`
		PhoneSet     bool   `json:"phone_set"`
		Created      string `json:"created_at,omitempty"`
	}
	var slim []userSummary
	for _, u := range resp.Response.Data {
		phone := derefStringRaw(u.PhoneNum)
		slim = append(slim, userSummary{
			UID:          derefUint64Raw(u.Uid),
			Name:         derefStringRaw(u.Name),
			NickName:     derefStringRaw(u.NickName),
			Email:        derefStringRaw(u.Email),
			ConsoleLogin: derefUint64Raw(u.ConsoleLogin) == 1,
			PhoneSet:     phone != "",
			Created:      derefStringRaw(u.CreateTime),
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
