package sse

import "net/http"

type FlushingResponseWriter interface {
	http.ResponseWriter
	http.Flusher
}
