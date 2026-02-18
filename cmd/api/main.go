package main

import (
	"context"
	"errors"
	"os/signal"
	"syscall"

	"github.com/cryptic-stack/probable-adventure/internal/app"
	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/cryptic-stack/probable-adventure/internal/db"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	cfg := config.Load()
	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		panic(err)
	}
	defer pool.Close()
	if err := app.StartHTTP(ctx, cfg, pool); err != nil && !errors.Is(err, context.Canceled) {
		panic(err)
	}
}
