package snapshot

import (
	"encoding/json"
	"time"

	"github.com/AbdullahJaswal/flightpath/api/internal/model"
)

type encoded struct {
	Time     time.Time        `json:"time"`
	Aircraft []model.Aircraft `json:"aircraft"`
}

// Marshal serialises a snapshot for the shared cache.
func Marshal(s *Snapshot) ([]byte, error) {
	return json.Marshal(encoded{Time: s.Time, Aircraft: s.aircraft})
}

// Unmarshal rebuilds a snapshot produced by Marshal.
func Unmarshal(b []byte) (*Snapshot, error) {
	var e encoded
	if err := json.Unmarshal(b, &e); err != nil {
		return nil, err
	}
	return New(e.Time, e.Aircraft), nil
}
