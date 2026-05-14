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
	tencentCmd.PersistentFlags().StringVar(&region, "region", "", "Tencent Cloud region (default from config / TENCENTCLOUD_REGION / TENCENT_REGION / ap-singapore)")

	var allRegions bool
	listCmd := &cobra.Command{
		Use:   "list [resource]",
		Short: "List Tencent Cloud resources",
		Long: `List Tencent Cloud resources of a specific type.

Supported resources:
  cvm, instances              - Cloud Virtual Machine instances
  vpc, vpcs                   - Virtual Private Clouds
  subnets, subnet             - VPC subnets
  security-groups, sg, sgs    - Security Groups

Use --all-regions to fan out across every available region.`,
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

			regions := []string{client.Region()}
			if allRegions {
				all, err := client.ListAllRegions()
				if err != nil {
					return fmt.Errorf("list regions: %w", err)
				}
				if len(all) > 0 {
					regions = all
				}
				if debug {
					fmt.Printf("[tencent] fanning out across %d regions\n", len(regions))
				}
			}

			switch resourceType {
			case "cvm", "instance", "instances", "vm", "vms":
				return listCVM(client, regions)
			case "vpc", "vpcs":
				return listVPCs(client, regions)
			case "subnet", "subnets":
				return listSubnets(client, regions)
			case "sg", "sgs", "security-group", "security-groups":
				return listSecurityGroups(client, regions)
			default:
				return fmt.Errorf("unknown resource type: %s (supported: cvm, vpc, subnets, security-groups)", resourceType)
			}
		},
	}
	listCmd.Flags().BoolVar(&allRegions, "all-regions", false, "Query every available Tencent region and merge the results")

	regionsCmd := &cobra.Command{
		Use:   "regions",
		Short: "List all Tencent Cloud regions available to this credential",
		RunE: func(cmd *cobra.Command, args []string) error {
			creds := ResolveCredentials()
			if region != "" {
				creds.Region = region
			}
			client, err := NewClient(creds, viper.GetBool("debug"))
			if err != nil {
				return err
			}
			all, err := client.ListAllRegions()
			if err != nil {
				return err
			}
			fmt.Printf("Tencent Cloud regions (%d):\n\n", len(all))
			for _, r := range all {
				fmt.Println("  " + r)
			}
			return nil
		},
	}

	sgRulesCmd := &cobra.Command{
		Use:   "sg-rules [security-group-id]",
		Short: "Audit ingress/egress rules of a security group",
		Long: `Print every ingress and egress rule for a security group and flag
risky rules — anything that allows 0.0.0.0/0 (or ::/0) inbound to a sensitive
port (22, 3306, 3389, 5432, 6379, 9200, 27017).`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			sgID := strings.TrimSpace(args[0])
			if sgID == "" {
				return fmt.Errorf("security group id is required")
			}
			creds := ResolveCredentials()
			if region != "" {
				creds.Region = region
			}
			client, err := NewClient(creds, viper.GetBool("debug"))
			if err != nil {
				return err
			}
			return listSGRules(client, sgID)
		},
	}

	tencentCmd.AddCommand(listCmd)
	tencentCmd.AddCommand(regionsCmd)
	tencentCmd.AddCommand(sgRulesCmd)
	return tencentCmd
}
