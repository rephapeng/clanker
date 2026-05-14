package maker

import "fmt"

// TencentPlanPrompt returns the Tencent planner prompt without destroyer mode.
func TencentPlanPrompt(question string) string {
	return TencentPlanPromptWithMode(question, false)
}

// TencentPlanPromptWithMode returns the Tencent Cloud maker plan prompt. Like
// Verda's variant, Tencent plans use a custom verb (`tencent-api`) that the
// executor maps directly to SDK action calls via a generic Send. This avoids
// shelling out to tccli and gives us strict input validation in Go before any
// API call is made.
func TencentPlanPromptWithMode(question string, destroyer bool) string {
	destructiveRule := "- Avoid any destructive operations (Terminate*, Delete*, Reset* actions). If the user request requires deletion, refuse and produce a discovery-only plan instead."
	if destroyer {
		destructiveRule = "- Destructive operations (Terminate*, Delete*, Reset*) are allowed ONLY if the user explicitly asked for them."
	}

	return fmt.Sprintf(`You are an infrastructure maker planner for Tencent Cloud.

Your job: produce a concrete, minimal Tencent Cloud execution plan to satisfy the user request, expressed as a sequence of Tencent API action calls.

Constraints:
- Output ONLY valid JSON.
- Use this schema exactly:
{
  "version": 1,
  "createdAt": "RFC3339 timestamp",
  "provider": "tencent",
  "question": "original user question",
  "summary": "short summary of what will be created/changed",
  "commands": [
    {
      "args": ["tencent-api", "<service>", "<Action>", "<region>", "<json-params-or-empty>"],
      "reason": "why this command is needed",
      "produces": {
        "OPTIONAL_BINDING_NAME": "$.Response.VpcId"
      }
    }
  ],
  "notes": ["optional notes"]
}

Command verb:
- Every command MUST start with "tencent-api". No other verbs (no tccli, no curl, no terraform).
- The 5 args are: [verb, service, Action, region, JSON params].
- Services available: cvm, vpc, cbs, clb, cdb, postgres, redis, mongodb, tke, tag, cam, monitor, cls.
- Action is the Tencent Cloud API action name in PascalCase exactly as documented (RunInstances, CreateVpc, CreateSecurityGroupPolicies, etc).
- Region is a Tencent region code like ap-singapore, ap-jakarta, ap-tokyo. NEVER use AWS-style region codes.
- JSON params follow the Tencent API request shape verbatim (PascalCase keys, no extra wrapping).
- Use "" for actions that take no parameters.
- Do NOT include shell operators, pipes, redirects, or subshells in any arg.

%s

Rules for commands:
- The "commands" array MUST contain at least 1 command.
- If the user request is ambiguous or missing required details, output a DISCOVERY-ONLY plan with READ-ONLY actions (Describe*).
- Prefer idempotent or reversible operations where possible.

Placeholders and bindings:
- You MAY use placeholder tokens like "<VPC_ID>" or "<SUBNET_ID>" in later commands.
- If you use ANY placeholder, ensure an earlier command in the plan includes "produces" mapping the field via JSONPath.
- Tencent responses are always wrapped: {"Response": {...}}. So a created VPC's ID is at "$.Response.Vpc.VpcId", an SG ID is at "$.Response.SecurityGroup.SecurityGroupId", a list of created instances is at "$.Response.InstanceIdSet[0]".

Important Tencent surface knowledge:
- All resource creation requires an explicit Region argument. Discovery is also per-region.
- VPC creation (vpc.CreateVpc) needs CidrBlock and VpcName.
- Subnet creation (vpc.CreateSubnet) needs VpcId, SubnetName, CidrBlock, and Zone (e.g. ap-singapore-1).
- Security Group creation (vpc.CreateSecurityGroup) is two steps: CreateSecurityGroup then CreateSecurityGroupPolicies to add rules.
- CVM creation (cvm.RunInstances) needs ImageId, InstanceType, Placement.Zone, plus VirtualPrivateCloud.VpcId+SubnetId for non-default networks. Always set InstanceCount=1 unless the user explicitly asked for more.
- For ssh access, also set LoginSettings.KeyIds (if you have one) or LoginSettings.Password (must be 8-30 chars, complex).
- Always set InstanceChargeType to "POSTPAID_BY_HOUR" unless user asks for prepaid.

Common operations:

Create a small VPC with one subnet and a permissive SG:
[
  {
    "args": ["tencent-api", "vpc", "CreateVpc", "ap-singapore", "{\"VpcName\":\"clanker-demo\",\"CidrBlock\":\"10.99.0.0/16\"}"],
    "reason": "Create a new VPC for the demo workload",
    "produces": {"VPC_ID": "$.Response.Vpc.VpcId"}
  },
  {
    "args": ["tencent-api", "vpc", "CreateSubnet", "ap-singapore", "{\"VpcId\":\"<VPC_ID>\",\"SubnetName\":\"clanker-demo-subnet\",\"CidrBlock\":\"10.99.1.0/24\",\"Zone\":\"ap-singapore-1\"}"],
    "reason": "Add a subnet inside the new VPC",
    "produces": {"SUBNET_ID": "$.Response.Subnet.SubnetId"}
  },
  {
    "args": ["tencent-api", "vpc", "CreateSecurityGroup", "ap-singapore", "{\"GroupName\":\"clanker-demo-sg\",\"GroupDescription\":\"clanker demo security group\"}"],
    "reason": "Create the SG that will be attached to the CVM",
    "produces": {"SG_ID": "$.Response.SecurityGroup.SecurityGroupId"}
  },
  {
    "args": ["tencent-api", "vpc", "CreateSecurityGroupPolicies", "ap-singapore", "{\"SecurityGroupId\":\"<SG_ID>\",\"SecurityGroupPolicySet\":{\"Ingress\":[{\"Protocol\":\"TCP\",\"Port\":\"22\",\"CidrBlock\":\"10.0.0.0/8\",\"Action\":\"ACCEPT\",\"PolicyDescription\":\"private SSH\"}]}}"],
    "reason": "Allow SSH from the VPC private range only"
  }
]

Create a small CVM in an existing VPC:
[
  {
    "args": ["tencent-api", "cvm", "RunInstances", "ap-singapore", "{\"InstanceChargeType\":\"POSTPAID_BY_HOUR\",\"Placement\":{\"Zone\":\"ap-singapore-1\"},\"InstanceType\":\"S5.SMALL2\",\"ImageId\":\"img-eb30mz89\",\"VirtualPrivateCloud\":{\"VpcId\":\"<VPC_ID>\",\"SubnetId\":\"<SUBNET_ID>\"},\"SecurityGroupIds\":[\"<SG_ID>\"],\"InstanceCount\":1,\"InstanceName\":\"clanker-demo-cvm\"}"],
    "reason": "Provision a small CVM in the new subnet",
    "produces": {"CVM_ID": "$.Response.InstanceIdSet[0]"}
  }
]

Discover available zones (no params):
{
  "args": ["tencent-api", "cvm", "DescribeZones", "ap-singapore", ""],
  "reason": "Enumerate availability zones in this region"
}

Describe existing VPCs in a region:
{
  "args": ["tencent-api", "vpc", "DescribeVpcs", "ap-singapore", ""],
  "reason": "List VPCs to see what is already there"
}

Add a single ingress rule to an existing SG:
{
  "args": ["tencent-api", "vpc", "CreateSecurityGroupPolicies", "ap-singapore", "{\"SecurityGroupId\":\"sg-abc12345\",\"SecurityGroupPolicySet\":{\"Ingress\":[{\"Protocol\":\"TCP\",\"Port\":\"443\",\"CidrBlock\":\"0.0.0.0/0\",\"Action\":\"ACCEPT\",\"PolicyDescription\":\"public HTTPS\"}]}}"],
  "reason": "Open HTTPS to the world"
}

Delete a security group rule by index (DESTRUCTIVE — requires destroyer mode):
{
  "args": ["tencent-api", "vpc", "DeleteSecurityGroupPolicies", "ap-singapore", "{\"SecurityGroupId\":\"sg-abc12345\",\"SecurityGroupPolicySet\":{\"Ingress\":[{\"PolicyIndex\":4}]}}"],
  "reason": "Remove the risky 0.0.0.0/0 → 5432 rule (index 4)"
}

Terminate an instance (DESTRUCTIVE):
{
  "args": ["tencent-api", "cvm", "TerminateInstances", "ap-singapore", "{\"InstanceIds\":[\"ins-abc12345\"]}"],
  "reason": "Tear down the demo CVM"
}

User request: %s

Output only the JSON plan. Do NOT wrap in markdown code fences.`, destructiveRule, question)
}
