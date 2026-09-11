package snapshot

import (
	"sync"
	"sync/atomic"
)

// Store publishes the current snapshot to readers and subscribers.
type Store struct {
	cur  atomic.Pointer[Snapshot]
	mu   sync.Mutex
	subs map[chan *Snapshot]struct{}
}

func NewStore() *Store {
	return &Store{subs: make(map[chan *Snapshot]struct{})}
}

// Current returns the latest snapshot or nil before the first poll.
func (st *Store) Current() *Snapshot { return st.cur.Load() }

// Set replaces the snapshot and notifies subscribers without blocking. A subscriber that has not
// taken the previous snapshot yet gets this one in its place, so it only ever misses stale ones.
func (st *Store) Set(s *Snapshot) {
	st.cur.Store(s)
	st.mu.Lock()
	defer st.mu.Unlock()
	for ch := range st.subs {
		select {
		case ch <- s:
			continue
		default:
		}
		select {
		case <-ch:
		default:
		}
		select {
		case ch <- s:
		default:
		}
	}
}

// Subscribe returns a channel that receives new snapshots and a function to unsubscribe.
func (st *Store) Subscribe() (<-chan *Snapshot, func()) {
	ch := make(chan *Snapshot, 1)
	st.mu.Lock()
	st.subs[ch] = struct{}{}
	st.mu.Unlock()
	return ch, func() {
		st.mu.Lock()
		delete(st.subs, ch)
		st.mu.Unlock()
	}
}
