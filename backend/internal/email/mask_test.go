package email

import "testing"

func TestMaskAddress(t *testing.T) {
	cases := map[string]string{
		"anna@example.com": "an***@example.com",
		"ab@x.ru":          "a***@x.ru",
		"я@почта.рф":       "я***@почта.рф",
		"no-at-sign":       "***",
		"@domain.com":      "***",
	}
	for in, want := range cases {
		if got := MaskAddress(in); got != want {
			t.Errorf("MaskAddress(%q) = %q, want %q", in, got, want)
		}
	}
}
