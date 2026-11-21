package api

import "testing"

func TestSecurityEffectiveResolution(t *testing.T) {
	off := false
	st := &secState{
		global: map[string]secRow{
			"text_selection_restriction": {Enabled: true},
			"right_click_restriction":    {Enabled: false},
		},
		pages: map[string]map[string]bool{
			"reports": {"text_selection_restriction": off, "right_click_restriction": true},
		},
	}

	// Defaults apply when no row exists.
	if !st.effective("orders")["dynamic_watermark"] {
		t.Fatal("watermark should default ON")
	}
	// Global value applies where no page override exists.
	if !st.effective("orders")["text_selection_restriction"] || st.effective("orders")["right_click_restriction"] {
		t.Fatal("global values not applied")
	}
	// Page override wins over global, both directions.
	r := st.effective("reports")
	if r["text_selection_restriction"] || !r["right_click_restriction"] {
		t.Fatal("page override should win over global")
	}
	// Monitoring features never appear in the browser config.
	if _, ok := r["security_event_logging"]; ok {
		t.Fatal("monitor feature leaked into UI config")
	}
	// Master OFF disables every UI protection, overrides included.
	st.global[secMasterKey] = secRow{Enabled: false}
	for k, v := range st.effective("reports") {
		if v {
			t.Fatalf("%s still on with master off", k)
		}
	}
	// ...but monitoring keeps its own global value.
	logging, _ := catalogFeature("security_event_logging")
	if !st.globalOn(logging) {
		t.Fatal("master switch must not disable monitoring")
	}
}

func TestParseUA(t *testing.T) {
	b, o := parseUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0")
	if b != "Edge" || o != "Windows" {
		t.Fatalf("got %s/%s", b, o)
	}
	b, o = parseUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1")
	if b != "Safari" || o != "iOS" {
		t.Fatalf("got %s/%s", b, o)
	}
}

func TestCSVSafe(t *testing.T) {
	if csvSafe("=HYPERLINK(1)") != "'=HYPERLINK(1)" || csvSafe("ok") != "ok" {
		t.Fatal("csvSafe")
	}
}
