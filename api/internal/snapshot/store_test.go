package snapshot

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSubscriberGetsLatestSnapshot(t *testing.T) {
	st := NewStore()
	ch, unsubscribe := st.Subscribe()
	defer unsubscribe()
	first := New(time.Unix(1, 0), nil)
	second := New(time.Unix(2, 0), nil)
	st.Set(first)
	st.Set(second)
	// the unread first snapshot is replaced, not kept in front of the second
	require.Same(t, second, <-ch)
	select {
	case s := <-ch:
		t.Fatalf("unexpected extra snapshot %v", s.Time)
	default:
	}
}
