package maker

import (
	"context"
	"fmt"
	"strings"

	"github.com/bgdnvk/clanker/internal/tencent"
)

// ExecuteTencentPlan executes a Tencent Cloud maker plan. Commands take the
// form ["tencent-api", "<service>", "<Action>", "<region>", "<json-params>"]
// and are dispatched to the shared tencent.Client.SendRaw which uses the
// Tencent SDK's generic CommonRequest for signing + transport.
//
// Mirrors the Verda executor's shape (no CLI dependency, strict arg
// validation, destructive ops gated by --destroyer). Idempotent error codes
// like "ResourceAlreadyExists" are treated as soft successes so re-running a
// partially-applied plan converges.
func ExecuteTencentPlan(ctx context.Context, plan *Plan, opts ExecOptions) error {
	if plan == nil {
		return fmt.Errorf("nil plan")
	}
	if opts.Writer == nil {
		return fmt.Errorf("missing output writer")
	}
	if opts.TencentSecretID == "" || opts.TencentSecretKey == "" {
		return fmt.Errorf("missing tencent credentials (set tencent.secret_id / tencent.secret_key, TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY, or TENCENT_SECRET_ID / TENCENT_SECRET_KEY)")
	}

	creds := tencent.Credentials{
		SecretID:  opts.TencentSecretID,
		SecretKey: opts.TencentSecretKey,
		Region:    opts.TencentRegion,
	}
	client, err := tencent.NewClient(creds, opts.Debug)
	if err != nil {
		return fmt.Errorf("build tencent client: %w", err)
	}

	bindings := make(map[string]string)

	for idx, cmdSpec := range plan.Commands {
		args := make([]string, 0, len(cmdSpec.Args))
		args = append(args, cmdSpec.Args...)
		args = applyPlanBindings(args, bindings)

		if err := validateTencentCommand(args, opts.Destroyer); err != nil {
			return fmt.Errorf("command %d rejected: %w", idx+1, err)
		}
		if hasUnresolvedPlaceholders(args) {
			return fmt.Errorf("command %d has unresolved placeholders after substitutions", idx+1)
		}

		service := strings.ToLower(strings.TrimSpace(args[1]))
		action := strings.TrimSpace(args[2])
		region := strings.TrimSpace(args[3])
		params := ""
		if len(args) >= 5 {
			params = args[4]
		}

		_, _ = fmt.Fprintf(opts.Writer, "[maker] running %d/%d: tencent-api %s.%s region=%s\n",
			idx+1, len(plan.Commands), service, action, region)
		if opts.Debug && params != "" {
			_, _ = fmt.Fprintf(opts.Writer, "[maker]   params: %s\n", params)
		}

		body, err := client.SendRaw(service, action, region, params)
		if err != nil {
			if isTencentSoftFailure(err) {
				_, _ = fmt.Fprintf(opts.Writer, "[maker]   soft failure (treating as success): %v\n", err)
				continue
			}
			return fmt.Errorf("tencent command %d failed (%s.%s): %w", idx+1, service, action, err)
		}

		if strings.TrimSpace(body) != "" {
			_, _ = fmt.Fprintln(opts.Writer, body)
		}
		learnPlanBindingsFromProduces(cmdSpec.Produces, body, bindings)
	}

	return nil
}

// validateTencentCommand rejects anything that isn't a well-formed tencent-api
// call. Destructive actions (Terminate*, Delete*, Reset*) are gated behind
// --destroyer to match the policy applied to every other provider.
func validateTencentCommand(args []string, allowDestructive bool) error {
	if len(args) < 4 {
		return fmt.Errorf("tencent plan commands require at least 4 args [verb, service, action, region], got %d", len(args))
	}
	if len(args) > 5 {
		return fmt.Errorf("tencent plan commands take at most 5 args [verb, service, action, region, params], got %d", len(args))
	}

	verb := strings.ToLower(strings.TrimSpace(args[0]))
	if verb != "tencent-api" {
		return fmt.Errorf("only tencent-api verb is supported (got %q)", args[0])
	}

	service := strings.ToLower(strings.TrimSpace(args[1]))
	if service == "" {
		return fmt.Errorf("service is required")
	}

	action := strings.TrimSpace(args[2])
	if action == "" {
		return fmt.Errorf("action is required")
	}

	region := strings.TrimSpace(args[3])
	if region == "" {
		return fmt.Errorf("region is required")
	}

	for _, a := range args {
		if strings.ContainsAny(a, "\n\r") {
			return fmt.Errorf("newlines in args are not allowed")
		}
	}

	if !allowDestructive && isTencentDestructive(action) {
		return fmt.Errorf("destructive tencent operation blocked (use --destroyer to allow): %s.%s", service, action)
	}
	return nil
}

// isTencentDestructive flags actions that delete, terminate, or reset
// resources. Conservative: anything ambiguous is treated as destructive so the
// --destroyer gate is opt-in.
func isTencentDestructive(action string) bool {
	a := action
	for _, prefix := range []string{"Terminate", "Delete", "Destroy", "Reset", "Release", "Discontinue"} {
		if strings.HasPrefix(a, prefix) {
			// Whitelist: ResetInstancesPassword only changes the password, not data.
			if a == "ResetInstancesPassword" {
				return false
			}
			return true
		}
	}
	return false
}

// isTencentSoftFailure returns true for error codes that indicate the desired
// state already exists, which is safe to treat as a no-op success during
// idempotent re-applies.
func isTencentSoftFailure(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, s := range []string{
		"ResourceInUse",
		"ResourceAlreadyExists",
		"AlreadyExists",
		"InvalidParameterValue.Duplicate",
		"InvalidVpc.Duplicate",
	} {
		if strings.Contains(msg, s) {
			return true
		}
	}
	return false
}
