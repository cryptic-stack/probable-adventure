package main

import (
	"context"
	"errors"
	"os/signal"
	"syscall"

	"github.com/cryptic-stack/probable-adventure/internal/config"
	"github.com/cryptic-stack/probable-adventure/internal/db"
	"github.com/cryptic-stack/probable-adventure/internal/provisioner"
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
	worker, err := provisioner.NewWorker(pool, cfg.WorkerID, cfg.DockerHost)
	if err != nil {
		panic(err)
	}
	if err := worker.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		panic(err)
	}
}
