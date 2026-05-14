package tencent

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	sdkerrors "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/common/errors"
	cvm "github.com/tencentcloud/tencentcloud-sdk-go/tencentcloud/cvm/v20170312"
)

// listCVM prints every CVM instance in the client's region.
func listCVM(c *Client) error {
	client, err := c.CVM()
	if err != nil {
		return fmt.Errorf("init cvm client: %w", err)
	}

	req := cvm.NewDescribeInstancesRequest()
	var offset, limit int64 = 0, 100
	req.Offset = &offset
	req.Limit = &limit

	var collected []*cvm.Instance
	for {
		resp, err := client.DescribeInstances(req)
		if err != nil {
			return fmt.Errorf("DescribeInstances: %w", friendlyError(err))
		}
		if resp == nil || resp.Response == nil {
			break
		}
		collected = append(collected, resp.Response.InstanceSet...)
		total := derefInt64(resp.Response.TotalCount)
		offset += int64(len(resp.Response.InstanceSet))
		if int64(len(collected)) >= total || len(resp.Response.InstanceSet) == 0 {
			break
		}
		req.Offset = &offset
	}

	fmt.Printf("Tencent Cloud CVM Instances (region=%s):\n\n", c.Region())
	if len(collected) == 0 {
		fmt.Println("  No CVM instances found")
		return nil
	}

	tw := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintln(tw, "INSTANCE_ID\tNAME\tSTATE\tTYPE\tPRIVATE_IP\tPUBLIC_IP\tZONE\tCREATED")
	for _, inst := range collected {
		fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n",
			derefString(inst.InstanceId),
			derefString(inst.InstanceName),
			derefString(inst.InstanceState),
			derefString(inst.InstanceType),
			joinIPs(inst.PrivateIpAddresses),
			joinIPs(inst.PublicIpAddresses),
			derefString(inst.Placement.Zone),
			derefString(inst.CreatedTime),
		)
	}
	return tw.Flush()
}

func joinIPs(ptrs []*string) string {
	if len(ptrs) == 0 {
		return "-"
	}
	var out []string
	for _, p := range ptrs {
		if p != nil && *p != "" {
			out = append(out, *p)
		}
	}
	if len(out) == 0 {
		return "-"
	}
	return strings.Join(out, ",")
}

func derefString(s *string) string {
	if s == nil {
		return "-"
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return "-"
	}
	return v
}

func derefInt64(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
}

// friendlyError converts Tencent SDK errors into something users can act on
// without exposing the full SDK wrapper noise.
func friendlyError(err error) error {
	if err == nil {
		return nil
	}
	if sdkErr, ok := err.(*sdkerrors.TencentCloudSDKError); ok {
		hint := ""
		switch sdkErr.Code {
		case "AuthFailure", "AuthFailure.SignatureFailure", "AuthFailure.SecretIdNotFound":
			hint = " (check TENCENTCLOUD_SECRET_ID/TENCENT_SECRET_ID and matching secret key)"
		case "UnauthorizedOperation.CamNoAuth", "UnauthorizedOperation":
			hint = " (sub-account is missing CAM permissions for this API)"
		}
		return fmt.Errorf("[%s] %s%s", sdkErr.Code, sdkErr.Message, hint)
	}
	return err
}
