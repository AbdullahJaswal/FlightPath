package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestETagRevalidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	e := gin.New()
	e.Use(etag())
	e.GET("/thing", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"a": 1}) })
	e.GET("/missing", func(c *gin.Context) { c.JSON(http.StatusNotFound, gin.H{"status": 404}) })

	get := func(path, ifNoneMatch string) *httptest.ResponseRecorder {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, path, nil)
		if ifNoneMatch != "" {
			req.Header.Set("If-None-Match", ifNoneMatch)
		}
		rec := httptest.NewRecorder()
		e.ServeHTTP(rec, req)
		return rec
	}

	first := get("/thing", "")
	require.Equal(t, http.StatusOK, first.Code)
	require.JSONEq(t, `{"a":1}`, first.Body.String())
	tag := first.Header().Get("ETag")
	require.NotEmpty(t, tag)

	second := get("/thing", tag)
	require.Equal(t, http.StatusNotModified, second.Code)
	require.Empty(t, second.Body.String())
	require.Equal(t, tag, second.Header().Get("ETag"))

	third := get("/thing", `W/"stale", `+tag)
	require.Equal(t, http.StatusNotModified, third.Code)

	notFound := get("/missing", "")
	require.Equal(t, http.StatusNotFound, notFound.Code)
	require.Empty(t, notFound.Header().Get("ETag"))
}
