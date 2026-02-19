package config

import (
	"net/url"
	"testing"
)

func TestGetRoomUrlUsesRelativePathByDefault(t *testing.T) {
	cfg := Room{
		PathPrefix: "/room",
	}

	got := cfg.GetRoomUrl("alpha")
	want := "/room/alpha/"

	if got != want {
		t.Fatalf("unexpected room url: got %q, want %q", got, want)
	}
}

func TestGetRoomUrlUsesExplicitInstanceURL(t *testing.T) {
	instance, err := url.Parse("https://rooms.example.com/base/")
	if err != nil {
		t.Fatalf("failed to parse URL: %v", err)
	}

	cfg := Room{
		PathPrefix: "/room",
		InstanceUrl: instance,
	}

	got := cfg.GetRoomUrl("alpha")
	want := "https://rooms.example.com/base/room/alpha/"

	if got != want {
		t.Fatalf("unexpected room url: got %q, want %q", got, want)
	}
}

