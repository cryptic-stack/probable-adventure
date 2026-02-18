package templates

import "testing"

func TestValidateDefinitionOK(t *testing.T) {
	in := []byte(`{"name":"linux-lab","services":[{"name":"web","image":"nginx:alpine","network":"corporate","ports":[{"container":80,"host":0}]}]}`)
	if err := ValidateDefinition(in); err != nil {
		t.Fatalf("expected valid definition, got %v", err)
	}
}

func TestValidateDefinitionInvalidJSON(t *testing.T) {
	in := []byte(`{"name":`)
	if err := ValidateDefinition(in); err == nil {
		t.Fatalf("expected error")
	}
}

func TestValidateDefinitionRequiresFields(t *testing.T) {
	cases := [][]byte{
		[]byte(`{"services":[{"name":"web","image":"nginx"}]}`),
		[]byte(`{"name":"x","services":[]}`),
		[]byte(`{"name":"x","services":[{"name":"","image":"nginx"}]}`),
		[]byte(`{"name":"x","services":[{"name":"web","image":"","ports":[{"container":80,"host":0}]}]}`),
		[]byte(`{"name":"x","services":[{"name":"web","image":"nginx","ports":[{"container":70000,"host":0}]}]}`),
		[]byte(`{"name":"x","services":[{"name":"web","image":"nginx","ports":[{"container":80,"host":0,"protocol":"icmp"}]}]}`),
		[]byte(`{"name":"x","services":[{"name":"web","image":"nginx","network":"unknown"}]}`),
	}
	for i, in := range cases {
		if err := ValidateDefinition(in); err == nil {
			t.Fatalf("case %d expected error", i)
		}
	}
}

func TestNormalizeNetworkDefault(t *testing.T) {
	if got := NormalizeNetwork(""); got != "corporate" {
		t.Fatalf("expected corporate, got %q", got)
	}
}
