package tencent

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// CreateTencentCommands wires the `clanker tencent` subtree.
func CreateTencentCommands() *cobra.Command {
	tencentCmd := &cobra.Command{
		Use:     "tencent",
		Short:   "Query Tencent Cloud infrastructure directly",
		Long:    "Query your Tencent Cloud infrastructure without AI interpretation. Useful for getting raw data.",
		Aliases: []string{"tc", "tencentcloud"},
	}

	var region string
	tencentCmd.PersistentFlags().StringVar(&region, "region", "", "Tencent Cloud region (default from config / TENCENTCLOUD_REGION / ap-singapore)")

	listCmd := &cobra.Command{
		Use:   "list [resource]",
		Short: "List Tencent Cloud resources",
		Long: `List Tencent Cloud resources of a specific type in the configured region.

Supported resources:
  cvm, instances              - Cloud Virtual Machine instances
  vpc, vpcs                   - Virtual Private Clouds
  subnets, subnet             - VPC subnets
  security-groups, sg, sgs    - Security Groups`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resourceType := strings.ToLower(strings.TrimSpace(args[0]))

			creds := ResolveCredentials()
			if region != "" {
				creds.Region = region
			}

			debug := viper.GetBool("debug")
			client, err := NewClient(creds, debug)
			if err != nil {
				return err
			}

			switch resourceType {
			case "cvm", "instance", "instances", "vm", "vms":
				return listCVM(client)
			case "vpc", "vpcs":
				return listVPCs(client)
			case "subnet", "subnets":
				return listSubnets(client)
			case "sg", "sgs", "security-group", "security-groups":
				return listSecurityGroups(client)
			default:
				return fmt.Errorf("unknown resource type: %s (supported: cvm, vpc, subnets, security-groups)", resourceType)
			}
		},
	}

	tencentCmd.AddCommand(listCmd)
	return tencentCmd
}
