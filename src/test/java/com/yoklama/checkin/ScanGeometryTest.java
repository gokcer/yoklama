package com.yoklama.checkin;

import org.junit.jupiter.api.Test;

import java.util.Locale;

import static org.junit.jupiter.api.Assertions.*;

class ScanGeometryTest {

    @Test
    void areaRatioOfSquare() {
        double[][] c = {{0, 0}, {100, 0}, {100, 100}, {0, 100}};
        assertEquals(0.25, ScanGeometry.areaRatio(c, 200, 200), 1e-9);
    }

    @Test
    void invalidCornersGiveNull() {
        assertNull(ScanGeometry.areaRatio(new double[][]{{0, 0}, {1, 1}}, 10, 10));
        assertNull(ScanGeometry.areaRatio(new double[][]{{0, 0}, {1}, {1, 1}, {0, 1}}, 10, 10));
        assertNull(ScanGeometry.areaRatio(new double[][]{{0, 0}, {1, 0}, {1, 1}, {0, Double.NaN}}, 10, 10));
        assertNull(ScanGeometry.areaRatio(new double[][]{{0, 0}, {1, 0}, {1, 1}, {0, 1}}, 0, 10));
    }

    @Test
    void formatIsLocaleIndependent() {
        Locale prev = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            assertEquals("[[412.5,180.0],[540.2,182.1],[538.9,309.7],[410.8,307.3]]",
                    ScanGeometry.format(new double[][]{{412.5, 180}, {540.2, 182.1}, {538.9, 309.7}, {410.8, 307.3}}));
        } finally {
            Locale.setDefault(prev);
        }
    }
}
