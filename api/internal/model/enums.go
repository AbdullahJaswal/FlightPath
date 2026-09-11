package model

import "github.com/danielgtaylor/huma/v2"

// enumSchema registers a named string enum once and references it, so clients get a named type.
func enumSchema(r huma.Registry, name, description string, values []string) *huma.Schema {
	if _, ok := r.Map()[name]; !ok {
		enum := make([]any, len(values))
		for i, v := range values {
			enum[i] = v
		}
		r.Map()[name] = &huma.Schema{Type: huma.TypeString, Title: name, Description: description, Enum: enum}
	}
	return &huma.Schema{Ref: "#/components/schemas/" + name}
}

// PositionSource is the surveillance technology that produced a position.
type PositionSource string

const (
	SourceADSB    PositionSource = "adsb"
	SourceASTERIX PositionSource = "asterix"
	SourceMLAT    PositionSource = "mlat"
	SourceFLARM   PositionSource = "flarm"
	SourceUnknown PositionSource = "unknown"
)

// Schema implements huma.SchemaProvider.
func (PositionSource) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "PositionSource", "Surveillance technology that produced the position.",
		[]string{"adsb", "asterix", "mlat", "flarm", "unknown"})
}

// PositionSourceFromOpenSky maps the OpenSky position_source field.
func PositionSourceFromOpenSky(n int) PositionSource {
	switch n {
	case 0:
		return SourceADSB
	case 1:
		return SourceASTERIX
	case 2:
		return SourceMLAT
	case 3:
		return SourceFLARM
	}
	return SourceUnknown
}

// Category is the ADS-B emitter category.
type Category string

const (
	CategoryUnknown          Category = "unknown"
	CategoryLight            Category = "light"
	CategorySmall            Category = "small"
	CategoryLarge            Category = "large"
	CategoryHighVortexLarge  Category = "high_vortex_large"
	CategoryHeavy            Category = "heavy"
	CategoryHighPerformance  Category = "high_performance"
	CategoryRotorcraft       Category = "rotorcraft"
	CategoryGlider           Category = "glider"
	CategoryLighterThanAir   Category = "lighter_than_air"
	CategoryParachutist      Category = "parachutist"
	CategoryUltralight       Category = "ultralight"
	CategoryUAV              Category = "uav"
	CategorySpace            Category = "space"
	CategoryEmergencySurface Category = "emergency_surface"
	CategoryServiceSurface   Category = "service_surface"
	CategoryObstacle         Category = "obstacle"
)

var categories = []string{
	"unknown", "light", "small", "large", "high_vortex_large", "heavy", "high_performance",
	"rotorcraft", "glider", "lighter_than_air", "parachutist", "ultralight", "uav", "space",
	"emergency_surface", "service_surface", "obstacle",
}

var openSkyCategories = map[int]Category{
	2: CategoryLight, 3: CategorySmall, 4: CategoryLarge, 5: CategoryHighVortexLarge,
	6: CategoryHeavy, 7: CategoryHighPerformance, 8: CategoryRotorcraft, 9: CategoryGlider,
	10: CategoryLighterThanAir, 11: CategoryParachutist, 12: CategoryUltralight, 14: CategoryUAV,
	15: CategorySpace, 16: CategoryEmergencySurface, 17: CategoryServiceSurface,
	18: CategoryObstacle, 19: CategoryObstacle, 20: CategoryObstacle,
}

// Schema implements huma.SchemaProvider.
func (Category) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "Category", "ADS-B emitter category.", categories)
}

// CategoryFromOpenSky maps the OpenSky category field.
func CategoryFromOpenSky(n int) Category {
	if c, ok := openSkyCategories[n]; ok {
		return c
	}
	return CategoryUnknown
}

// FlightStatus is the schedule status reported by aviationstack.
type FlightStatus string

const (
	StatusScheduled FlightStatus = "scheduled"
	StatusActive    FlightStatus = "active"
	StatusLanded    FlightStatus = "landed"
	StatusCancelled FlightStatus = "cancelled"
	StatusIncident  FlightStatus = "incident"
	StatusDiverted  FlightStatus = "diverted"
	StatusUnknown   FlightStatus = "unknown"
)

var flightStatuses = []string{"scheduled", "active", "landed", "cancelled", "incident", "diverted", "unknown"}

// Schema implements huma.SchemaProvider.
func (FlightStatus) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "FlightStatus", "Schedule status of a flight.", flightStatuses)
}

// ParseFlightStatus maps an aviationstack status string.
func ParseFlightStatus(s string) FlightStatus {
	for _, v := range flightStatuses {
		if s == v {
			return FlightStatus(v)
		}
	}
	return StatusUnknown
}

// MetaSource identifies the upstream that produced a piece of metadata.
type MetaSource string

const (
	MetaADSBDB        MetaSource = "adsbdb"
	MetaAviationstack MetaSource = "aviationstack"
)

// Schema implements huma.SchemaProvider.
func (MetaSource) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "MetaSource", "Upstream that produced the metadata.", []string{"adsbdb", "aviationstack"})
}

// TrailSource identifies where a trail came from.
type TrailSource string

const (
	TrailStored  TrailSource = "stored"
	TrailOpenSky TrailSource = "opensky"
	TrailNone    TrailSource = "none"
)

// Schema implements huma.SchemaProvider.
func (TrailSource) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "TrailSource", "Origin of the trail points.", []string{"stored", "opensky", "none"})
}

// PollerMode describes what the position poller is doing.
type PollerMode string

const (
	ModeActive   PollerMode = "active"
	ModeIdle     PollerMode = "idle"
	ModePaused   PollerMode = "paused"
	ModeFollower PollerMode = "follower"
	ModeDisabled PollerMode = "disabled"
)

// Schema implements huma.SchemaProvider.
func (PollerMode) Schema(r huma.Registry) *huma.Schema {
	return enumSchema(r, "PollerMode", "Poller state. Active while viewers are connected, idle otherwise, paused when out of credits, follower when another instance polls.",
		[]string{"active", "idle", "paused", "follower", "disabled"})
}
