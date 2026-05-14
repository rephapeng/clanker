package tencent

import (
	"fmt"
	"os"
	"text/tabwriter"

	vpc "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/vpc/v20170312"
)

func listVPCs(c *Client) error {
	client, err := c.VPC()
	if err != nil {
		return fmt.Errorf("init vpc client: %w", err)
	}

	req := vpc.NewDescribeVpcsRequest()
	var offset, limit uint64 = 0, 100
	offsetStr := fmt.Sprintf("%d", offset)
	limitStr := fmt.Sprintf("%d", limit)
	req.Offset = &offsetStr
	req.Limit = &limitStr

	resp, err := client.DescribeVpcs(req)
	if err != nil {
		return fmt.Errorf("DescribeVpcs: %w", friendlyError(err))
	}

	fmt.Printf("Tencent Cloud VPCs (region=%s):\n\n", c.Region())
	if resp == nil || resp.Response == nil || len(resp.Response.VpcSet) == 0 {
		fmt.Println("  No VPCs found")
		return nil
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "VPC_ID\tNAME\tCIDR\tDEFAULT\tDNS_SERVERS\tCREATED")
	for _, v := range resp.Response.VpcSet {
		fmt.Fprintf(tw, "%s\t%s\t%s\t%v\t%s\t%s\n",
			derefString(v.VpcId),
			derefString(v.VpcName),
			derefString(v.CidrBlock),
			derefBool(v.IsDefault),
			joinIPs(v.DnsServerSet),
			derefString(v.CreatedTime),
		)
	}
	return tw.Flush()
}

func listSubnets(c *Client) error {
	client, err := c.VPC()
	if err != nil {
		return fmt.Errorf("init vpc client: %w", err)
	}

	req := vpc.NewDescribeSubnetsRequest()
	resp, err := client.DescribeSubnets(req)
	if err != nil {
		return fmt.Errorf("DescribeSubnets: %w", friendlyError(err))
	}

	fmt.Printf("Tencent Cloud Subnets (region=%s):\n\n", c.Region())
	if resp == nil || resp.Response == nil || len(resp.Response.SubnetSet) == 0 {
		fmt.Println("  No subnets found")
		return nil
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "SUBNET_ID\tNAME\tVPC_ID\tCIDR\tZONE\tAVAIL_IPS\tDEFAULT")
	for _, s := range resp.Response.SubnetSet {
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%d\t%v\n",
			derefString(s.SubnetId),
			derefString(s.SubnetName),
			derefString(s.VpcId),
			derefString(s.CidrBlock),
			derefString(s.Zone),
			derefUint64(s.AvailableIpAddressCount),
			derefBool(s.IsDefault),
		)
	}
	return tw.Flush()
}

func listSecurityGroups(c *Client) error {
	client, err := c.VPC()
	if err != nil {
		return fmt.Errorf("init vpc client: %w", err)
	}

	req := vpc.NewDescribeSecurityGroupsRequest()
	resp, err := client.DescribeSecurityGroups(req)
	if err != nil {
		return fmt.Errorf("DescribeSecurityGroups: %w", friendlyError(err))
	}

	fmt.Printf("Tencent Cloud Security Groups (region=%s):\n\n", c.Region())
	if resp == nil || resp.Response == nil || len(resp.Response.SecurityGroupSet) == 0 {
		fmt.Println("  No security groups found")
		return nil
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "SG_ID\tNAME\tDESCRIPTION\tDEFAULT\tCREATED")
	for _, g := range resp.Response.SecurityGroupSet {
		fmt.Fprintf(tw, "%s\t%s\t%s\t%v\t%s\n",
			derefString(g.SecurityGroupId),
			derefString(g.SecurityGroupName),
			derefString(g.SecurityGroupDesc),
			derefBool(g.IsDefault),
			derefString(g.CreatedTime),
		)
	}
	return tw.Flush()
}

func derefBool(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

func derefUint64(v *uint64) uint64 {
	if v == nil {
		return 0
	}
	return *v
}
