package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type etagWriter struct {
	gin.ResponseWriter
	buf    bytes.Buffer
	status int
}

func (w *etagWriter) WriteHeader(code int)              { w.status = code }
func (w *etagWriter) WriteHeaderNow()                   {}
func (w *etagWriter) Write(b []byte) (int, error)       { return w.buf.Write(b) }
func (w *etagWriter) WriteString(s string) (int, error) { return w.buf.WriteString(s) }
func (w *etagWriter) Size() int                         { return w.buf.Len() }
func (w *etagWriter) Written() bool                     { return w.status != 0 || w.buf.Len() > 0 }
func (w *etagWriter) Status() int {
	if w.status == 0 {
		return http.StatusOK
	}
	return w.status
}

// etag buffers successful GET responses, tags them with a hash of the body and answers
// If-None-Match with 304 so clients revalidate cheaply instead of re-downloading unchanged data.
func etag() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet || c.GetHeader("Upgrade") != "" {
			c.Next()
			return
		}
		w := &etagWriter{ResponseWriter: c.Writer}
		c.Writer = w
		c.Next()
		rw := w.ResponseWriter
		status := w.Status()
		body := w.buf.Bytes()
		if status == http.StatusOK && len(body) > 0 && !strings.Contains(rw.Header().Get("Cache-Control"), "no-store") {
			sum := sha256.Sum256(body)
			tag := `W/"` + hex.EncodeToString(sum[:16]) + `"`
			rw.Header().Set("ETag", tag)
			if etagMatches(c.GetHeader("If-None-Match"), tag) {
				rw.WriteHeader(http.StatusNotModified)
				return
			}
		}
		rw.WriteHeader(status)
		_, _ = rw.Write(body)
	}
}

func etagMatches(header, tag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || candidate == tag {
			return true
		}
	}
	return false
}
