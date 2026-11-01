package com.yoklama.decision;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GeoMathTest {

    @Test
    void oneDegreeOfLatitude() {
        // 1° of latitude on a 6 371 km sphere = 111 194.93 m
        assertEquals(111_194.93, GeoMath.haversineMeters(39.0, 32.0, 40.0, 32.0), 1.0);
    }

    @Test
    void ankaraToIstanbul() {
        // Kızılay (39.9208, 32.8541) – Taksim (41.0369, 28.9850): 349 950.6 m on R=6371 km
        double d = GeoMath.haversineMeters(39.9208, 32.8541, 41.0369, 28.9850);
        assertEquals(349_950.6, d, 1.0);
    }

    @Test
    void samePointIsZero() {
        assertEquals(0.0, GeoMath.haversineMeters(39.89, 32.78, 39.89, 32.78), 1e-9);
    }
}
