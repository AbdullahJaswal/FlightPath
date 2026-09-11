package errs

import "errors"

var (
	ErrNotFound      = errors.New("not found")
	ErrQuotaExceeded = errors.New("quota exceeded")
	ErrDisabled      = errors.New("disabled")
)
