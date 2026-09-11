// Command seed loads airport, airline and aircraft reference data into the database.
package main

import (
	"context"
	"encoding/csv"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/AbdullahJaswal/flightpath/api/internal/store"
)

const (
	defaultAirports = "https://davidmegginson.github.io/ourairports-data/airports.csv"
	defaultAirlines = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat"
	defaultAircraft = "https://s3.opensky-network.org/data-samples/metadata/aircraftDatabase.csv"
)

var (
	icao24Re = regexp.MustCompile(`^[0-9a-f]{6}$`)
	icaoRe   = regexp.MustCompile(`^[A-Z0-9]{3}$`)
)

func main() {
	airportsSrc := flag.String("airports", defaultAirports, "OurAirports airports.csv URL or path")
	airlinesSrc := flag.String("airlines", defaultAirlines, "OpenFlights airlines.dat URL or path")
	aircraftSrc := flag.String("aircraft", defaultAircraft, "OpenSky aircraft database CSV URL or path")
	only := flag.String("only", "airports,airlines,aircraft", "comma separated subset to load")
	flag.Parse()

	for _, p := range []string{".env", "../.env"} {
		if err := godotenv.Load(p); err == nil {
			break
		}
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, dsn)
	if err != nil {
		fail(err)
	}
	defer func() { _ = st.Close() }()
	if err := st.Migrate(ctx); err != nil {
		fail(err)
	}

	steps := map[string]func() error{
		"airports": func() error { return loadAirports(ctx, st, *airportsSrc, log) },
		"airlines": func() error { return loadAirlines(ctx, st, *airlinesSrc, log) },
		"aircraft": func() error { return loadAircraft(ctx, st, *aircraftSrc, log) },
	}
	for _, name := range strings.Split(*only, ",") {
		name = strings.TrimSpace(name)
		step, ok := steps[name]
		if !ok {
			fail(fmt.Errorf("unknown dataset %q", name))
		}
		start := time.Now()
		if err := step(); err != nil {
			fail(fmt.Errorf("%s: %w", name, err))
		}
		log.Info("loaded", "dataset", name, "took", time.Since(start).Round(time.Millisecond))
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func open(ctx context.Context, src string) (io.ReadCloser, error) {
	if !strings.HasPrefix(src, "http://") && !strings.HasPrefix(src, "https://") {
		return os.Open(src)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		_ = resp.Body.Close()
		return nil, fmt.Errorf("download %s: status %d", src, resp.StatusCode)
	}
	return resp.Body, nil
}

func newReader(r io.Reader) *csv.Reader {
	cr := csv.NewReader(r)
	cr.LazyQuotes = true
	cr.FieldsPerRecord = -1
	cr.ReuseRecord = true
	return cr
}

// header maps normalised column names to indexes. Names are lower-cased with quotes stripped.
func header(rec []string) map[string]int {
	m := make(map[string]int, len(rec))
	for i, name := range rec {
		m[strings.ToLower(strings.Trim(strings.TrimSpace(name), `'"`))] = i
	}
	return m
}

func field(rec []string, idx map[string]int, name string) string {
	i, ok := idx[name]
	if !ok || i >= len(rec) {
		return ""
	}
	return strings.TrimSpace(rec[i])
}

func loadAirports(ctx context.Context, st *store.Store, src string, log *slog.Logger) error {
	body, err := open(ctx, src)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	cr := newReader(body)
	head, err := cr.Read()
	if err != nil {
		return err
	}
	idx := header(head)
	var rows []store.Airport
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if field(rec, idx, "type") == "closed" {
			continue
		}
		id, err := strconv.ParseInt(field(rec, idx, "id"), 10, 64)
		if err != nil {
			continue
		}
		lat, errLat := strconv.ParseFloat(field(rec, idx, "latitude_deg"), 64)
		lon, errLon := strconv.ParseFloat(field(rec, idx, "longitude_deg"), 64)
		if errLat != nil || errLon != nil {
			continue
		}
		a := store.Airport{
			ID:           id,
			Ident:        field(rec, idx, "ident"),
			Type:         field(rec, idx, "type"),
			Name:         field(rec, idx, "name"),
			Lat:          lat,
			Lon:          lon,
			Continent:    field(rec, idx, "continent"),
			ISOCountry:   field(rec, idx, "iso_country"),
			ISORegion:    field(rec, idx, "iso_region"),
			Municipality: field(rec, idx, "municipality"),
			GPSCode:      field(rec, idx, "gps_code"),
			IATACode:     field(rec, idx, "iata_code"),
			LocalCode:    field(rec, idx, "local_code"),
		}
		if v, err := strconv.Atoi(field(rec, idx, "elevation_ft")); err == nil {
			a.ElevationFt = &v
		}
		rows = append(rows, a)
	}
	log.Info("parsed airports", "rows", len(rows))
	return st.ReplaceAirports(ctx, rows)
}

func loadAirlines(ctx context.Context, st *store.Store, src string, log *slog.Logger) error {
	body, err := open(ctx, src)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	cr := newReader(body)
	byICAO := make(map[string]store.Airline)
	active := make(map[string]bool)
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if len(rec) < 8 {
			continue
		}
		icao := clean(rec[4])
		if !icaoRe.MatchString(icao) || icao == "N/A" {
			continue
		}
		isActive := clean(rec[7]) == "Y"
		if _, seen := byICAO[icao]; seen && active[icao] && !isActive {
			continue
		}
		byICAO[icao] = store.Airline{ICAO: icao, IATA: clean(rec[3]), Name: clean(rec[1]), Callsign: clean(rec[5]), Country: clean(rec[6])}
		active[icao] = isActive
	}
	rows := make([]store.Airline, 0, len(byICAO))
	for _, a := range byICAO {
		rows = append(rows, a)
	}
	log.Info("parsed airlines", "rows", len(rows))
	return st.ReplaceAirlines(ctx, rows)
}

func loadAircraft(ctx context.Context, st *store.Store, src string, log *slog.Logger) error {
	body, err := open(ctx, src)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	cr := newReader(body)
	head, err := cr.Read()
	if err != nil {
		return err
	}
	idx := header(head)
	byHex := make(map[string]store.Aircraft)
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		hex := strings.ToLower(field(rec, idx, "icao24"))
		if !icao24Re.MatchString(hex) {
			continue
		}
		byHex[hex] = store.Aircraft{
			ICAO24:       hex,
			Registration: strings.ToUpper(field(rec, idx, "registration")),
			TypeCode:     field(rec, idx, "typecode"),
			Model:        field(rec, idx, "model"),
			Manufacturer: field(rec, idx, "manufacturername"),
			Operator:     field(rec, idx, "operator"),
			OperatorICAO: field(rec, idx, "operatoricao"),
			Owner:        field(rec, idx, "owner"),
		}
	}
	rows := make([]store.Aircraft, 0, len(byHex))
	for _, a := range byHex {
		rows = append(rows, a)
	}
	log.Info("parsed aircraft", "rows", len(rows))
	return st.ReplaceAircraft(ctx, rows)
}

// clean strips OpenFlights null markers.
func clean(s string) string {
	s = strings.TrimSpace(s)
	if s == `\N` {
		return ""
	}
	return s
}
