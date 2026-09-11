package opensky

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const statesBody = `{"time":1700000000,"states":[
["3c6444","DLH2AB  ","Germany",1699999990,1699999995,8.5,50.1,10000.5,false,230.2,90.5,-2.1,null,10200.0,"1000",false,0,4],
["abcdef","NOPOS   ","Nowhere",null,1699999995,null,null,null,true,null,null,null,null,null,null,false,0,0]
]}`

func TestStatesParsesVectorsAndQuota(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/states/all", r.URL.Path)
		require.Equal(t, "1", r.URL.Query().Get("extended"))
		require.Empty(t, r.Header.Get("Authorization"))
		w.Header().Set("X-Rate-Limit-Remaining", "396")
		_, _ = w.Write([]byte(statesBody))
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.True(t, c.Anonymous())
	st, err := c.States(context.Background())
	require.NoError(t, err)
	require.Equal(t, 396, st.Quota.Remaining)
	require.Equal(t, time.Unix(1700000000, 0).UTC(), st.Time)
	require.Len(t, st.Aircraft, 1)

	a := st.Aircraft[0]
	require.Equal(t, "3c6444", a.ICAO24)
	require.Equal(t, "DLH2AB", a.Callsign)
	require.Equal(t, 50.1, a.Lat)
	require.Equal(t, 8.5, a.Lon)
	require.Equal(t, 10000.5, *a.BaroAltM)
	require.Equal(t, 90.5, *a.HeadingDeg)
	require.False(t, a.OnGround)
	require.Equal(t, model.SourceADSB, a.Source)
	require.Equal(t, model.CategoryLarge, a.Category)
	require.Equal(t, time.Unix(1699999990, 0).UTC(), a.PositionAt)
}

func TestStatesRateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Rate-Limit-Retry-After-Seconds", "120")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, HTTPClient: srv.Client()})
	_, err := c.States(context.Background())
	var rl *RateLimitError
	require.ErrorAs(t, err, &rl)
	require.Equal(t, 120*time.Second, rl.RetryAfter)
}

func TestTokenFetchedOnceAndSent(t *testing.T) {
	var tokenCalls atomic.Int32
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		tokenCalls.Add(1)
		require.NoError(t, r.ParseForm())
		require.Equal(t, "client_credentials", r.Form.Get("grant_type"))
		require.Equal(t, "id", r.Form.Get("client_id"))
		require.Equal(t, "secret", r.Form.Get("client_secret"))
		_, _ = w.Write([]byte(`{"access_token":"tok","expires_in":1800}`))
	})
	mux.HandleFunc("/states/all", func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "Bearer tok", r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`{"time":1,"states":[]}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := New(Config{ClientID: "id", ClientSecret: "secret", BaseURL: srv.URL, TokenURL: srv.URL + "/token", HTTPClient: srv.Client()})
	for range 3 {
		_, err := c.States(context.Background())
		require.NoError(t, err)
	}
	require.Equal(t, int32(1), tokenCalls.Load())
}

func TestTrack(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/tracks/all", r.URL.Path)
		require.Equal(t, "0", r.URL.Query().Get("time"))
		switch r.URL.Query().Get("icao24") {
		case "3c6444":
			_, _ = w.Write([]byte(`{"icao24":"3c6444","callsign":"DLH2AB ","startTime":1700000000,"endTime":1700003600,
"path":[[1700000000,50.0,8.0,1000,90,false],[1700000600,50.5,8.5,2000,95,false]]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := New(Config{BaseURL: srv.URL, HTTPClient: srv.Client()})
	tr, err := c.Track(context.Background(), "3C6444")
	require.NoError(t, err)
	require.Equal(t, "DLH2AB", tr.Callsign)
	require.Len(t, tr.Path, 2)
	require.Equal(t, 50.0, tr.Path[0].Lat)
	require.Equal(t, 90.0, *tr.Path[0].HeadingDeg)

	_, err = c.Track(context.Background(), "000000")
	require.ErrorIs(t, err, errs.ErrNotFound)
}
