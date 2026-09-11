package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCountryOfICAO24(t *testing.T) {
	require.Equal(t, "United States", CountryOfICAO24("a98ac6"))
	require.Equal(t, "United Arab Emirates", CountryOfICAO24("896420"))
	require.Equal(t, "Switzerland", CountryOfICAO24("4b1805"))
	require.Equal(t, "Germany", CountryOfICAO24("3c6444"))
	require.Equal(t, "Pakistan", CountryOfICAO24("760123"))
	require.Equal(t, "", CountryOfICAO24("ffffff"))
	require.Equal(t, "", CountryOfICAO24("zz"))
}

func TestCountryOfICAO24Nested(t *testing.T) {
	// Bermuda is carved out of the United Kingdom block
	require.Equal(t, "Bermuda", CountryOfICAO24("400100"))
	require.Equal(t, "United Kingdom", CountryOfICAO24("401000"))
}
