package snapshot

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

func ac(icao, cs string, lat, lon float64) model.Aircraft {
	return model.Aircraft{ICAO24: icao, Callsign: cs, Lat: lat, Lon: lon}
}

func TestQueryBounds(t *testing.T) {
	s := New(time.Now(), []model.Aircraft{
		ac("a1", "AAA1", 50, 8),
		ac("b2", "BBB2", 40, -74),
		ac("c3", "CCC3", -33.9, 151),
		ac("d4", "DDD4", 64, -179.5),
		ac("e5", "EEE5", 64, 179.5),
	})

	got, total := s.Query(Bounds{West: 0, South: 45, East: 20, North: 55}, 100)
	require.Equal(t, 1, total)
	require.Equal(t, "a1", got[0].ICAO24)

	got, total = s.Query(Bounds{West: 170, South: 60, East: -170, North: 70}, 100)
	require.Equal(t, 2, total)
	require.Len(t, got, 2)

	_, total = s.Query(World(), 0)
	require.Equal(t, 5, total)
}

func TestQueryThinningIsStable(t *testing.T) {
	list := make([]model.Aircraft, 0, 1000)
	for i := range 1000 {
		list = append(list, ac(fmt.Sprintf("%06x", i), "", float64(i%90), float64(i%180)))
	}
	s := New(time.Now(), list)

	got, total := s.Query(World(), 100)
	require.Equal(t, 1000, total)
	require.Len(t, got, 100)

	again, _ := s.Query(World(), 100)
	require.Equal(t, got, again)
}

func TestLookups(t *testing.T) {
	s := New(time.Now(), []model.Aircraft{ac("abc123", "DLH2AB", 50, 8), ac("def456", "", 51, 9)})

	a, ok := s.Get("abc123")
	require.True(t, ok)
	require.Equal(t, "DLH2AB", a.Callsign)

	_, ok = s.ByCallsign("NOPE")
	require.False(t, ok)
	_, ok = s.ByCallsign("DLH2AB")
	require.True(t, ok)

	require.Len(t, s.Search("dlh", 10), 1)
	require.Len(t, s.Search("de", 10), 1)
	require.Equal(t, 2, s.Len())
}

func TestCodecRoundTrip(t *testing.T) {
	s := New(time.Unix(1700000000, 0).UTC(), []model.Aircraft{ac("abc123", "DLH2AB", 50, 8)})
	b, err := Marshal(s)
	require.NoError(t, err)
	back, err := Unmarshal(b)
	require.NoError(t, err)
	require.Equal(t, s.Time, back.Time)
	_, ok := back.Get("abc123")
	require.True(t, ok)
}

func TestStoreSubscribe(t *testing.T) {
	st := NewStore()
	require.Nil(t, st.Current())
	ch, unsubscribe := st.Subscribe()
	defer unsubscribe()

	s := New(time.Now(), nil)
	st.Set(s)
	require.Equal(t, s, st.Current())
	select {
	case got := <-ch:
		require.Equal(t, s, got)
	default:
		t.Fatal("subscriber was not notified")
	}
}
