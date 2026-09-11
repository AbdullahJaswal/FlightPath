package planespotters

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

const photoBody = `{"photos":[{"id":"1948036",
"thumbnail":{"src":"https://t.plnspttrs.net/1948036_t.jpg","size":{"width":200,"height":112}},
"thumbnail_large":{"src":"https://t.plnspttrs.net/1948036_280.jpg","size":{"width":497,"height":280}},
"link":"https://www.planespotters.net/photo/1948036/d-aibc?utm_source=api","photographer":"Cornelius Grossmann"}]}`

const userAgent = "Flightpath/test (+https://example.com/)"

func TestPhotos(t *testing.T) {
	var mu sync.Mutex
	var agents []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		agents = append(agents, r.UserAgent())
		mu.Unlock()
		switch r.URL.Path {
		case "/photos/hex/3c6444":
			_, _ = w.Write([]byte(photoBody))
		case "/photos/reg/D-AIBC":
			_, _ = w.Write([]byte(`{"photos":[]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"not found"}`))
		}
	}))
	defer srv.Close()

	c := New(srv.URL, userAgent, srv.Client())
	p, err := c.ByHex(context.Background(), "3C6444")
	require.NoError(t, err)
	require.Equal(t, "1948036", p.ID)
	require.Equal(t, "https://t.plnspttrs.net/1948036_t.jpg", p.Thumbnail.Src)
	require.Equal(t, 200, p.Thumbnail.Width)
	require.Equal(t, 280, p.Large.Height)
	require.Equal(t, "Cornelius Grossmann", p.Photographer)
	require.Contains(t, p.Link, "planespotters.net/photo/1948036")

	_, err = c.ByRegistration(context.Background(), "d-aibc")
	require.ErrorIs(t, err, errs.ErrNotFound)

	_, err = c.ByHex(context.Background(), "000000")
	require.ErrorIs(t, err, errs.ErrNotFound)

	mu.Lock()
	defer mu.Unlock()
	require.Len(t, agents, 3)
	for _, ua := range agents {
		require.Equal(t, userAgent, ua)
	}
}
