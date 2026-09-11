package store

import (
	"encoding/json"
	"time"

	"github.com/uptrace/bun"
)

type Airport struct {
	bun.BaseModel `bun:"table:airports,alias:ap"`

	ID           int64   `bun:"id,pk"`
	Ident        string  `bun:"ident,notnull"`
	Type         string  `bun:"type,notnull"`
	Name         string  `bun:"name,notnull"`
	Lat          float64 `bun:"lat,notnull"`
	Lon          float64 `bun:"lon,notnull"`
	ElevationFt  *int    `bun:"elevation_ft"`
	Continent    string  `bun:"continent,nullzero"`
	ISOCountry   string  `bun:"iso_country,nullzero"`
	ISORegion    string  `bun:"iso_region,nullzero"`
	Municipality string  `bun:"municipality,nullzero"`
	GPSCode      string  `bun:"gps_code,nullzero"`
	IATACode     string  `bun:"iata_code,nullzero"`
	LocalCode    string  `bun:"local_code,nullzero"`
}

type Airline struct {
	bun.BaseModel `bun:"table:airlines,alias:al"`

	ICAO     string `bun:"icao,pk"`
	IATA     string `bun:"iata,nullzero"`
	Name     string `bun:"name,notnull"`
	Callsign string `bun:"callsign,nullzero"`
	Country  string `bun:"country,nullzero"`
}

type Aircraft struct {
	bun.BaseModel `bun:"table:aircraft,alias:ac"`

	ICAO24       string `bun:"icao24,pk"`
	Registration string `bun:"registration,nullzero"`
	TypeCode     string `bun:"type_code,nullzero"`
	Model        string `bun:"model,nullzero"`
	Manufacturer string `bun:"manufacturer,nullzero"`
	Operator     string `bun:"operator,nullzero"`
	OperatorICAO string `bun:"operator_icao,nullzero"`
	Owner        string `bun:"owner,nullzero"`
}

type FlightMeta struct {
	bun.BaseModel `bun:"table:flight_meta,alias:fm"`

	Callsign  string          `bun:"callsign,pk"`
	Source    string          `bun:"source,pk"`
	Found     bool            `bun:"found,notnull"`
	Payload   json.RawMessage `bun:"payload,type:jsonb,nullzero"`
	FetchedAt time.Time       `bun:"fetched_at,notnull"`
	ExpiresAt time.Time       `bun:"expires_at,notnull"`
}

type Position struct {
	bun.BaseModel `bun:"table:positions,alias:p"`

	ICAO24     string    `bun:"icao24,pk"`
	TS         time.Time `bun:"ts,pk"`
	Callsign   string    `bun:"callsign,nullzero"`
	Lat        float64   `bun:"lat,notnull"`
	Lon        float64   `bun:"lon,notnull"`
	BaroAltM   *float64  `bun:"baro_alt_m"`
	VelocityMS *float64  `bun:"velocity_ms"`
	HeadingDeg *float64  `bun:"heading_deg"`
	VertRateMS *float64  `bun:"vert_rate_ms"`
	OnGround   bool      `bun:"on_ground,notnull"`
}

type APIUsage struct {
	bun.BaseModel `bun:"table:api_usage,alias:u"`

	Provider  string    `bun:"provider,pk"`
	Period    string    `bun:"period,pk"`
	Count     int       `bun:"count,notnull"`
	UpdatedAt time.Time `bun:"updated_at,notnull"`
}
