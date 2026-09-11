package opensky

import (
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

// parseState converts one state vector array. Vectors without a position are skipped.
func parseState(sv []any) (model.Aircraft, bool) {
	if len(sv) < 17 {
		return model.Aircraft{}, false
	}
	lon, okLon := num(sv[5])
	lat, okLat := num(sv[6])
	if !okLon || !okLat {
		return model.Aircraft{}, false
	}
	a := model.Aircraft{
		ICAO24:     str(sv[0]),
		Callsign:   strings.TrimSpace(str(sv[1])),
		Country:    str(sv[2]),
		Lat:        lat,
		Lon:        lon,
		BaroAltM:   numPtr(sv[7]),
		OnGround:   boolean(sv[8]),
		VelocityMS: numPtr(sv[9]),
		HeadingDeg: numPtr(sv[10]),
		VertRateMS: numPtr(sv[11]),
		GeoAltM:    numPtr(sv[13]),
		Squawk:     str(sv[14]),
		Source:     model.PositionSourceFromOpenSky(intOr(sv[16], -1)),
		Category:   model.CategoryUnknown,
	}
	if len(sv) > 17 {
		a.Category = model.CategoryFromOpenSky(intOr(sv[17], 0))
	}
	if t, ok := num(sv[3]); ok {
		a.PositionAt = time.Unix(int64(t), 0).UTC()
	}
	if t, ok := num(sv[4]); ok {
		a.LastContact = time.Unix(int64(t), 0).UTC()
	}
	return a, true
}

func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

func numPtr(v any) *float64 {
	if f, ok := v.(float64); ok {
		return &f
	}
	return nil
}

func boolean(v any) bool {
	b, _ := v.(bool)
	return b
}

func intOr(v any, def int) int {
	if f, ok := v.(float64); ok {
		return int(f)
	}
	return def
}
