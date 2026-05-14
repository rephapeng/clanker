package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/bgdnvk/clanker/internal/api"
	"github.com/spf13/cobra"
)

func init() {
	var (
		port       int
		host       string
		token      string
		corsOrigin string
		debug      bool
	)

	serverCmd := &cobra.Command{
		Use:   "server",
		Short: "Run the Clanker HTTP API server",
		Long: `Start the HTTP API server that wraps the Clanker agent.

This is the gateway for the future Clanker web dashboard. It exposes
read-only inventory endpoints today; mutation endpoints (ask, maker)
will arrive in a later phase.

Auth: pass --token or set CLANKER_API_TOKEN. If neither is set, the
server runs in open mode (loud warning to stderr).

Examples:
  # Open server for local dev
  clanker server --port 8080

  # Token-gated server
  clanker server --port 8080 --token "$(openssl rand -hex 32)"

  # Bind to all interfaces with a specific CORS origin
  clanker server --host 0.0.0.0 --port 8080 --cors-origin https://dash.example.com`,
		RunE: func(cmd *cobra.Command, args []string) error {
			resolved := strings.TrimSpace(token)
			if resolved == "" {
				resolved = strings.TrimSpace(os.Getenv("CLANKER_API_TOKEN"))
			}
			addr := fmt.Sprintf("%s:%d", host, port)
			api.SetVersion(Version)

			srv := api.New(api.Config{
				Addr:       addr,
				Token:      resolved,
				CORSOrigin: corsOrigin,
				Debug:      debug,
			}, log.New(os.Stderr, "", log.LstdFlags))

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
			go func() {
				<-sigCh
				fmt.Fprintln(os.Stderr, "[server] shutting down")
				cancel()
			}()
			return srv.Run(ctx)
		},
	}

	serverCmd.Flags().IntVar(&port, "port", 8080, "Port to listen on")
	serverCmd.Flags().StringVar(&host, "host", "127.0.0.1", "Host to bind on (use 0.0.0.0 for all interfaces)")
	serverCmd.Flags().StringVar(&token, "token", "", "Bearer token required for /api/v1/* (or set CLANKER_API_TOKEN; empty disables auth)")
	serverCmd.Flags().StringVar(&corsOrigin, "cors-origin", "*", "Value for Access-Control-Allow-Origin")
	serverCmd.Flags().BoolVar(&debug, "server-debug", false, "Log every request, not just errors")

	rootCmd.AddCommand(serverCmd)
}
