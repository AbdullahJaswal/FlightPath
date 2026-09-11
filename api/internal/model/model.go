package model

import "time"

// Aircraft is one aircraft state from the latest snapshot.
type Aircraft struct {
	ICAO24      string         `json:"icao24" doc:"Mode S address, lower-case hex." example:"3c6444"`
	Callsign    string         `json:"callsign,omitempty" doc:"Callsign as broadcast, trimmed." example:"DLH2AB"`
	Country     string         `json:"country,omitempty" doc:"Country of registration inferred from the address." example:"Germany"`
	Lat         float64        `json:"lat" doc:"WGS-84 latitude in degrees." minimum:"-90" maximum:"90"`
	Lon         float64        `json:"lon" doc:"WGS-84 longitude in degrees." minimum:"-180" maximum:"180"`
	BaroAltM    *float64       `json:"baroAltM,omitempty" doc:"Barometric altitude in metres."`
	GeoAltM     *float64       `json:"geoAltM,omitempty" doc:"Geometric altitude in metres."`
	VelocityMS  *float64       `json:"velocityMs,omitempty" doc:"Ground speed in metres per second."`
	HeadingDeg  *float64       `json:"headingDeg,omitempty" doc:"True track in degrees clockwise from north."`
	VertRateMS  *float64       `json:"vertRateMs,omitempty" doc:"Vertical rate in metres per second, negative when descending."`
	OnGround    bool           `json:"onGround" doc:"True when the aircraft reports being on the ground."`
	Squawk      string         `json:"squawk,omitempty" doc:"Transponder code." example:"1000"`
	Source      PositionSource `json:"source"`
	Category    Category       `json:"category"`
	PositionAt  time.Time      `json:"positionAt" doc:"Time of the last position report."`
	LastContact time.Time      `json:"lastContact" doc:"Time of the last message received from the aircraft."`
}

// AircraftList is a thinned set of aircraft inside a bounding box.
type AircraftList struct {
	Time     time.Time  `json:"time" doc:"Snapshot time."`
	Total    int        `json:"total" doc:"Aircraft inside the bounds before thinning."`
	Count    int        `json:"count" doc:"Aircraft returned."`
	Aircraft []Aircraft `json:"aircraft"`
}

// AircraftInfo is static aircraft registration data.
type AircraftInfo struct {
	ICAO24       string `json:"icao24" example:"3c6444"`
	Registration string `json:"registration,omitempty" example:"D-AIBC"`
	TypeCode     string `json:"typeCode,omitempty" doc:"ICAO aircraft type designator." example:"A319"`
	Model        string `json:"model,omitempty" example:"Airbus A319-112"`
	Manufacturer string `json:"manufacturer,omitempty" example:"Airbus"`
	Operator     string `json:"operator,omitempty" example:"Lufthansa"`
	OperatorICAO string `json:"operatorIcao,omitempty" example:"DLH"`
	Owner        string `json:"owner,omitempty"`
}

// TrailPoint is one historical position.
type TrailPoint struct {
	Time       time.Time `json:"time"`
	Lat        float64   `json:"lat"`
	Lon        float64   `json:"lon"`
	BaroAltM   *float64  `json:"baroAltM,omitempty"`
	HeadingDeg *float64  `json:"headingDeg,omitempty"`
	OnGround   bool      `json:"onGround"`
}

// AircraftDetail combines the live state, registration data and the recent trail.
type AircraftDetail struct {
	ICAO24      string        `json:"icao24" example:"3c6444"`
	State       *Aircraft     `json:"state,omitempty" doc:"Current state, absent when the aircraft is not in the latest snapshot."`
	Info        *AircraftInfo `json:"info,omitempty"`
	Trail       []TrailPoint  `json:"trail" doc:"Positions in chronological order."`
	TrailSource TrailSource   `json:"trailSource"`
}

// Airport is airport reference data.
type Airport struct {
	ICAO         string  `json:"icao" doc:"ICAO identifier." example:"EDDF"`
	IATA         string  `json:"iata,omitempty" example:"FRA"`
	Name         string  `json:"name" example:"Frankfurt am Main Airport"`
	Type         string  `json:"type,omitempty" doc:"OurAirports type such as large_airport." example:"large_airport"`
	Municipality string  `json:"municipality,omitempty" example:"Frankfurt am Main"`
	Country      string  `json:"country,omitempty" doc:"ISO 3166-1 alpha-2 code." example:"DE"`
	Lat          float64 `json:"lat"`
	Lon          float64 `json:"lon"`
	ElevationFt  *int    `json:"elevationFt,omitempty"`
}

// Airline is airline reference data.
type Airline struct {
	ICAO     string `json:"icao" example:"DLH"`
	IATA     string `json:"iata,omitempty" example:"LH"`
	Name     string `json:"name" example:"Lufthansa"`
	Callsign string `json:"callsign,omitempty" example:"LUFTHANSA"`
	Country  string `json:"country,omitempty" example:"Germany"`
}

// Route is the origin and destination of a callsign.
type Route struct {
	Origin      *Airport   `json:"origin,omitempty"`
	Destination *Airport   `json:"destination,omitempty"`
	Source      MetaSource `json:"source"`
}

// FlightDetail describes a flight by callsign.
type FlightDetail struct {
	Callsign string        `json:"callsign" example:"DLH2AB"`
	Live     *Aircraft     `json:"live,omitempty" doc:"Current state when the callsign is airborne."`
	Airline  *Airline      `json:"airline,omitempty"`
	Route    *Route        `json:"route,omitempty"`
	Aircraft *AircraftInfo `json:"aircraft,omitempty"`
}

// ScheduleEndpoint is one end of a scheduled flight.
type ScheduleEndpoint struct {
	Airport   string     `json:"airport,omitempty" example:"Frankfurt International Airport"`
	IATA      string     `json:"iata,omitempty" example:"FRA"`
	ICAO      string     `json:"icao,omitempty" example:"EDDF"`
	Terminal  string     `json:"terminal,omitempty"`
	Gate      string     `json:"gate,omitempty"`
	Timezone  string     `json:"timezone,omitempty" example:"Europe/Berlin"`
	DelayMin  *int       `json:"delayMin,omitempty" doc:"Delay in minutes."`
	Scheduled *time.Time `json:"scheduled,omitempty"`
	Estimated *time.Time `json:"estimated,omitempty"`
	Actual    *time.Time `json:"actual,omitempty"`
}

// Schedule is the aviationstack view of a flight.
type Schedule struct {
	Callsign     string           `json:"callsign" example:"DLH2AB"`
	FlightDate   string           `json:"flightDate" doc:"Departure date in YYYY-MM-DD." example:"2026-09-11"`
	Status       FlightStatus     `json:"status"`
	FlightIATA   string           `json:"flightIata,omitempty" example:"LH2AB"`
	FlightICAO   string           `json:"flightIcao,omitempty" example:"DLH2AB"`
	Airline      *Airline         `json:"airline,omitempty"`
	Departure    ScheduleEndpoint `json:"departure"`
	Arrival      ScheduleEndpoint `json:"arrival"`
	Registration string           `json:"registration,omitempty"`
	FetchedAt    time.Time        `json:"fetchedAt" doc:"When the data was fetched from aviationstack."`
	Source       MetaSource       `json:"source"`
}

// SearchResult groups matches by kind.
type SearchResult struct {
	Aircraft []Aircraft `json:"aircraft" doc:"Airborne matches by callsign, address or registration."`
	Airports []Airport  `json:"airports"`
	Airlines []Airline  `json:"airlines"`
}

// PollerStatus reports the position poller.
type PollerStatus struct {
	Mode             PollerMode `json:"mode"`
	Leader           bool       `json:"leader" doc:"True when this instance runs the poller."`
	IntervalSeconds  int        `json:"intervalSeconds" doc:"Current poll interval."`
	LastPoll         *time.Time `json:"lastPoll,omitempty"`
	NextPoll         *time.Time `json:"nextPoll,omitempty"`
	CreditsRemaining int        `json:"creditsRemaining" doc:"OpenSky credits left today."`
	CreditsUsedToday int        `json:"creditsUsedToday"`
	LastError        string     `json:"lastError,omitempty"`
}

// QuotaStatus reports a monthly request budget.
type QuotaStatus struct {
	Enabled bool   `json:"enabled"`
	Used    int    `json:"used"`
	Cap     int    `json:"cap"`
	Period  string `json:"period" doc:"Month in YYYY-MM." example:"2026-09"`
}

// Stats is the service status.
type Stats struct {
	Version       string       `json:"version" example:"1.0.0"`
	SnapshotTime  *time.Time   `json:"snapshotTime,omitempty"`
	AircraftCount int          `json:"aircraftCount"`
	Viewers       int          `json:"viewers" doc:"Open live connections on this instance."`
	Poller        PollerStatus `json:"poller"`
	Aviationstack QuotaStatus  `json:"aviationstack"`
}
