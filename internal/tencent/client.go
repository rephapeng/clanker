package tencent

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/viper"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common"
	"github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/profile"
	cvm "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cvm/v20170312"
	vpc "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/vpc/v20170312"
)

const defaultRegion = "ap-singapore"

// Credentials holds the resolved Tencent Cloud credentials and target region.
type Credentials struct {
	SecretID  string
	SecretKey string
	Region    string
}

// Client wraps Tencent Cloud SDK clients scoped to a region.
type Client struct {
	creds Credentials
	debug bool
}

// ResolveCredentials reads Tencent credentials from config first, then env.
// Env vars use the names the official Tencent SDK already recognises so the
// same shell session that runs `tccli` will work without extra setup.
func ResolveCredentials() Credentials {
	c := Credentials{
		SecretID:  strings.TrimSpace(viper.GetString("tencent.secret_id")),
		SecretKey: strings.TrimSpace(viper.GetString("tencent.secret_key")),
		Region:    strings.TrimSpace(viper.GetString("tencent.region")),
	}
	if c.SecretID == "" {
		c.SecretID = firstNonEmpty(os.Getenv("TENCENTCLOUD_SECRET_ID"), os.Getenv("TENCENT_SECRET_ID"))
	}
	if c.SecretKey == "" {
		c.SecretKey = firstNonEmpty(os.Getenv("TENCENTCLOUD_SECRET_KEY"), os.Getenv("TENCENT_SECRET_KEY"))
	}
	if c.Region == "" {
		c.Region = firstNonEmpty(os.Getenv("TENCENTCLOUD_REGION"), os.Getenv("TENCENT_REGION"))
	}
	if c.Region == "" {
		c.Region = defaultRegion
	}
	return c
}

// NewClient validates credentials and returns a Tencent client ready to spawn
// per-service SDK clients.
func NewClient(creds Credentials, debug bool) (*Client, error) {
	if creds.SecretID == "" || creds.SecretKey == "" {
		return nil, fmt.Errorf("tencent credentials are required (set tencent.secret_id/tencent.secret_key, or TENCENTCLOUD_SECRET_ID/TENCENTCLOUD_SECRET_KEY)")
	}
	if creds.Region == "" {
		creds.Region = defaultRegion
	}
	return &Client{creds: creds, debug: debug}, nil
}

// Region returns the region this client is targeting.
func (c *Client) Region() string { return c.creds.Region }

// CVM returns a region-scoped CVM SDK client.
func (c *Client) CVM() (*cvm.Client, error) {
	cred := common.NewCredential(c.creds.SecretID, c.creds.SecretKey)
	cpf := profile.NewClientProfile()
	cpf.HttpProfile.Endpoint = "cvm.tencentcloudapi.com"
	return cvm.NewClient(cred, c.creds.Region, cpf)
}

// VPC returns a region-scoped VPC SDK client (also serves subnets + SGs).
func (c *Client) VPC() (*vpc.Client, error) {
	cred := common.NewCredential(c.creds.SecretID, c.creds.SecretKey)
	cpf := profile.NewClientProfile()
	cpf.HttpProfile.Endpoint = "vpc.tencentcloudapi.com"
	return vpc.NewClient(cred, c.creds.Region, cpf)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}
