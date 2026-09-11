package aviationstack

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/errs"
	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const flightBody = `{"pagination":{"limit":1,"offset":0,"count":1,"total":1},"data":[{"flight_date":"2026-09-11","flight_status":"active",
"departure":{"airport":"Frankfurt International Airport","timezone":"Europe/Berlin","iata":"FRA","icao":"EDDF","terminal":"1","gate":"A5","baggage":null,"delay":12,"scheduled":"2026-09-11T10:00:00+00:00","estimated":"2026-09-11T10:12:00+00:00","actual":null,"estimated_runway":null,"actual_runway":null},
"arrival":{"airport":"Heathrow","timezone":"Europe/London","iata":"LHR","icao":"EGLL","terminal":"2","gate":null,"baggage":null,"delay":null,"scheduled":"2026-09-11T11:30:00+00:00","estimated":"2026-09-11T11:30:00+00:00","actual":null,"estimated_runway":null,"actual_runway":null},
"airline":{"name":"Lufthansa","iata":"LH","icao":"DLH"},"flight":{"number":"2AB","iata":"LH2AB","icao":"DLH2AB","codeshared":null},
"aircraft":{"registration":"D-AIBC","iata":"A319","icao":"A319","icao24":"3C6444"},"live":null}]}`

func TestFlightByICAO(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/flights", r.URL.Path)
		require.Equal(t, "key", r.URL.Query().Get("access_key"))
		require.Equal(t, "1", r.URL.Query().Get("limit"))
		switch r.URL.Query().Get("flight_icao") {
		case "DLH2AB":
			_, _ = w.Write([]byte(flightBody))
		case "OVER":
			_, _ = w.Write([]byte(`{"error":{"code":104,"type":"usage_limit_reached","info":"limit reached"}}`))
		default:
			_, _ = w.Write([]byte(`{"pagination":{"count":0},"data":[]}`))
		}
	}))
	defer srv.Close()

	c := New(srv.URL, "key", srv.Client())
	f, err := c.FlightByICAO(context.Background(), "DLH2AB")
	require.NoError(t, err)
	require.Equal(t, model.StatusActive, f.Status)
	require.Equal(t, "LH2AB", f.IATA)
	require.Equal(t, "D-AIBC", f.Registration)
	require.Equal(t, 12, *f.Departure.Delay)
	require.Nil(t, f.Arrival.Delay)
	require.Equal(t, time.Date(2026, 9, 11, 10, 0, 0, 0, time.UTC), *f.Departure.Scheduled)
	require.Nil(t, f.Departure.Actual)
	require.Equal(t, "EGLL", f.Arrival.ICAO)

	_, err = c.FlightByICAO(context.Background(), "NOPE")
	require.ErrorIs(t, err, errs.ErrNotFound)

	_, err = c.FlightByICAO(context.Background(), "OVER")
	require.ErrorIs(t, err, errs.ErrQuotaExceeded)
}
