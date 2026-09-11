package adsbdb

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
)

const routeBody = `{"response":{"flightroute":{"callsign":"DLH2AB","callsign_iata":"LH2AB",
"airline":{"name":"Lufthansa","icao":"DLH","iata":"LH","country":"Germany","country_iso":"DE","callsign":"LUFTHANSA"},
"origin":{"country_iso_name":"DE","country_name":"Germany","elevation":364,"iata_code":"FRA","icao_code":"EDDF","latitude":50.0333,"longitude":8.5706,"municipality":"Frankfurt am Main","name":"Frankfurt Airport"},
"destination":{"country_iso_name":"GB","country_name":"United Kingdom","elevation":83,"iata_code":"LHR","icao_code":"EGLL","latitude":51.4706,"longitude":-0.4619,"municipality":"London","name":"London Heathrow Airport"}}}}`

func TestRoute(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/callsign/DLH2AB":
			_, _ = w.Write([]byte(routeBody))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"response":"unknown callsign"}`))
		}
	}))
	defer srv.Close()

	c := New(srv.URL, srv.Client())
	r, err := c.Route(context.Background(), "DLH2AB")
	require.NoError(t, err)
	require.Equal(t, "LH2AB", r.CallsignIATA)
	require.Equal(t, "DLH", r.Airline.ICAO)
	require.Equal(t, "EDDF", r.Origin.ICAO)
	require.Equal(t, 364, r.Origin.ElevationFt)
	require.Equal(t, "LHR", r.Destination.IATA)
	require.Equal(t, "GB", r.Destination.CountryISO)

	_, err = c.Route(context.Background(), "NOPE")
	require.ErrorIs(t, err, errs.ErrNotFound)
}
