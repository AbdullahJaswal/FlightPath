package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"
	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
	"github.com/AbdullahJaswal/flightpath/api/internal/snapshot"
)

func testAPI(t *testing.T) humatest.TestAPI {
	t.Helper()
	snaps := snapshot.NewStore()
	snaps.Set(snapshot.New(time.Unix(1700000000, 0).UTC(), []model.Aircraft{
		{ICAO24: "abc123", Callsign: "DLH2AB", Lat: 50, Lon: 8, Source: model.SourceADSB, Category: model.CategoryLarge},
		{ICAO24: "def456", Lat: -30, Lon: 150, Source: model.SourceMLAT, Category: model.CategoryUnknown},
	}))
	cfg := huma.DefaultConfig("test", "0")
	cfg.CreateHooks = nil
	cfg.SchemasPath = ""
	_, h := humatest.New(t, cfg)
	Register(h, Deps{Snaps: snaps, StaleAfter: 3 * time.Minute})
	return h
}

func TestListAircraft(t *testing.T) {
	h := testAPI(t)

	resp := h.Get("/aircraft?west=0&south=40&east=20&north=60")
	require.Equal(t, http.StatusOK, resp.Code)
	var list model.AircraftList
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &list))
	require.Equal(t, 1, list.Total)
	require.Equal(t, "DLH2AB", list.Aircraft[0].Callsign)
	require.Equal(t, model.SourceADSB, list.Aircraft[0].Source)
	require.True(t, list.Stale)
	require.Greater(t, list.AgeSeconds, 0)
	require.Equal(t, "private, no-cache", resp.Header().Get("Cache-Control"))

	resp = h.Get("/aircraft")
	require.Equal(t, http.StatusOK, resp.Code)
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &list))
	require.Equal(t, 2, list.Total)

	require.Equal(t, http.StatusUnprocessableEntity, h.Get("/aircraft?south=50&north=40").Code)
	require.Equal(t, http.StatusUnprocessableEntity, h.Get("/aircraft?limit=99999").Code)
	require.Equal(t, http.StatusUnprocessableEntity, h.Get("/aircraft/zzz").Code)
	require.Equal(t, http.StatusUnprocessableEntity, h.Get("/search?q=a").Code)
}

func TestOpenAPIDocument(t *testing.T) {
	h := testAPI(t)
	b, err := h.OpenAPI().MarshalJSON()
	require.NoError(t, err)
	var spec struct {
		Paths      map[string]map[string]map[string]any `json:"paths"`
		Components struct {
			Schemas map[string]map[string]any `json:"schemas"`
		} `json:"components"`
	}
	require.NoError(t, json.Unmarshal(b, &spec))

	for _, name := range []string{"PositionSource", "Category", "FlightStatus", "MetaSource", "PollerMode", "TrailSource", "Aircraft", "AircraftList", "FlightDetail", "Schedule", "Stats", "ErrorModel"} {
		require.Contains(t, spec.Components.Schemas, name)
	}
	require.ElementsMatch(t, []any{"adsb", "asterix", "mlat", "flarm", "unknown"}, spec.Components.Schemas["PositionSource"]["enum"])

	props := spec.Components.Schemas["Aircraft"]["properties"].(map[string]any)
	require.Equal(t, "#/components/schemas/PositionSource", props["source"].(map[string]any)["$ref"])
	require.NotContains(t, props, "$schema")

	require.Len(t, spec.Paths, 7)
	for path, item := range spec.Paths {
		for method, op := range item {
			require.NotEmpty(t, op["operationId"], path+" "+method)
			require.NotEmpty(t, op["tags"], path+" "+method)
		}
	}
}
