package adsb

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

const (
	footM    = 0.3048
	knotMS   = 0.514444
	fpmMS    = 0.00508
	hexChars = "0123456789abcdef"
)

type response struct {
	Aircraft []raw   `json:"ac"`
	Now      float64 `json:"now"`
}

// raw mirrors the readsb aircraft.json fields this app reads.
type raw struct {
	Hex      string          `json:"hex"`
	Type     string          `json:"type"`
	Flight   string          `json:"flight"`
	AltBaro  json.RawMessage `json:"alt_baro"`
	AltGeom  *float64        `json:"alt_geom"`
	GS       *float64        `json:"gs"`
	Track    *float64        `json:"track"`
	BaroRate *float64        `json:"baro_rate"`
	GeomRate *float64        `json:"geom_rate"`
	Squawk   string          `json:"squawk"`
	Category string          `json:"category"`
	Lat      *float64        `json:"lat"`
	Lon      *float64        `json:"lon"`
	Seen     *float64        `json:"seen"`
	SeenPos  *float64        `json:"seen_pos"`
	MLAT     []string        `json:"mlat"`
}

// parse converts one aircraft. Entries without a fresh position or a real ICAO address are skipped.
func parse(r raw, now time.Time, maxAge time.Duration) (model.Aircraft, bool) {
	hex := strings.ToLower(r.Hex)
	if !icaoHex(hex) || r.Lat == nil || r.Lon == nil || r.SeenPos == nil {
		return model.Aircraft{}, false
	}
	posAge := time.Duration(*r.SeenPos * float64(time.Second))
	if posAge > maxAge {
		return model.Aircraft{}, false
	}
	a := model.Aircraft{
		ICAO24:     hex,
		Callsign:   strings.TrimSpace(r.Flight),
		Country:    model.CountryOfICAO24(hex),
		Lat:        *r.Lat,
		Lon:        *r.Lon,
		GeoAltM:    scaled(r.AltGeom, footM),
		VelocityMS: scaled(r.GS, knotMS),
		HeadingDeg: r.Track,
		VertRateMS: scaled(r.BaroRate, fpmMS),
		Squawk:     r.Squawk,
		Source:     model.PositionSourceFromADSB(r.Type, len(r.MLAT) > 0),
		Category:   model.CategoryFromADSB(r.Category),
		PositionAt: now.Add(-posAge),
	}
	if a.VertRateMS == nil {
		a.VertRateMS = scaled(r.GeomRate, fpmMS)
	}
	if string(r.AltBaro) == `"ground"` {
		a.OnGround = true
	} else if r.AltBaro != nil {
		var ft float64
		if err := json.Unmarshal(r.AltBaro, &ft); err == nil {
			a.BaroAltM = scaled(&ft, footM)
		}
	}
	a.LastContact = a.PositionAt
	if r.Seen != nil {
		a.LastContact = now.Add(-time.Duration(*r.Seen * float64(time.Second)))
	}
	return a, true
}

func scaled(v *float64, factor float64) *float64 {
	if v == nil {
		return nil
	}
	f := *v * factor
	return &f
}

func icaoHex(s string) bool {
	if len(s) != 6 {
		return false
	}
	for _, ch := range s {
		if !strings.ContainsRune(hexChars, ch) {
			return false
		}
	}
	return true
}
