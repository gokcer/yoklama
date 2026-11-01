package com.yoklama.decision;

import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.GeoState;
import com.yoklama.checkin.ScanRecord;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class DecisionEngineTest {

    final DecisionEngine engine = new DecisionEngine();

    static ScanRecord scan(long ts, long latency, Double area, boolean suspect) {
        ScanRecord r = new ScanRecord(null, "t", ts + latency, ts + latency + 50, "captureTime", 960, 540);
        r.setValid(true);
        r.setTsMs(ts);
        r.setSeq((int) (ts / 1000));
        r.setAreaRatio(area);
        r.setClockSuspect(suspect);
        return r;
    }

    static List<ScanRecord> goodScans() {
        return List.of(scan(1000, 180, 0.03, false), scan(2000, 200, 0.02, false), scan(3000, 190, 0.03, false));
    }

    /** Baseline input that yields ACCEPTED. */
    record B(List<ScanRecord> scans, boolean frame, boolean frameCapture, boolean ble, int threshold,
             String source, double area, String geoMode, Double lat, Double lng, Double acc, String geoState,
             Integer s1rtt, Integer s1off, Integer s2rtt, Integer s2off, boolean camReused) {
        static B ok() {
            return new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "OFF",
                    null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        }
        DecisionInput input() {
            return new DecisionInput(scans, frame, frameCapture, ble, true, threshold, source, area, geoMode,
                    lat, lng, acc, geoState, 39.8912, 32.7835, 50, 150, s1rtt, s1off, s2rtt, s2off, 800, camReused);
        }
        B with(java.util.function.UnaryOperator<B> f) { return f.apply(this); }
    }

    Decision eval(B b) { return engine.evaluate(b.input()); }

    @Test
    void acceptedWhenClean() {
        Decision d = eval(B.ok());
        assertEquals(AttendanceStatus.ACCEPTED, d.status());
        assertEquals(Set.of(), d.flags());
        assertEquals(180, d.minLatencyMs());
        assertEquals(0.03, d.areaRatioMax(), 1e-9);
        assertEquals(GeoState.OFF, d.geoState());
        assertEquals("DEFAULT", d.thresholdSource());
    }

    @Test
    void latencyHigh() {
        B b = B.ok().with(x -> new B(List.of(scan(1000, 700, 0.02, false), scan(2000, 720, 0.02, false)),
                x.frame(), x.frameCapture(), x.ble(), x.threshold(), x.source(), x.area(), x.geoMode(), x.lat(),
                x.lng(), x.acc(), x.geoState(), x.s1rtt(), x.s1off(), x.s2rtt(), x.s2off(), x.camReused()));
        Decision d = eval(b);
        assertEquals(Set.of(Flag.LATENCY_HIGH), d.flags());
        assertEquals(AttendanceStatus.FLAGGED, d.status());
    }

    @Test
    void calibratedThresholdIsUsed() {
        B b = new B(goodScans(), true, true, false, 170, "CALIBRATED", 0.25, "OFF",
                null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(Flag.LATENCY_HIGH), d.flags());
        assertEquals("CALIBRATED", d.thresholdSource());
        assertEquals(170, d.latencyThresholdMs());
    }

    @Test
    void clockSuspectScansExcludedFromMinLatency() {
        B b = new B(List.of(scan(1000, 20, 0.02, true), scan(2000, 200, 0.02, false), scan(3000, 210, 0.02, false)),
                true, true, false, 450, "DEFAULT", 0.25, "OFF", null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        assertEquals(200, eval(b).minLatencyMs());
    }

    @Test
    void screenSuspect() {
        B b = new B(List.of(scan(1000, 180, 0.4, false), scan(2000, 200, 0.02, false)),
                true, true, false, 450, "DEFAULT", 0.25, "OFF", null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        assertEquals(Set.of(Flag.SCREEN_SUSPECT), eval(b).flags());
    }

    @Test
    void bleSuppressesLatencyAndScreen() {
        B b = new B(List.of(scan(1000, 700, 0.4, false), scan(2000, 720, 0.5, false)),
                true, true, true, 450, "DEFAULT", 0.25, "OFF", null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(), d.flags());
        assertEquals(700, d.minLatencyMs());
    }

    @Test
    void noFrame() {
        B b = new B(goodScans(), false, true, false, 450, "DEFAULT", 0.25, "OFF",
                null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        assertEquals(Set.of(Flag.NO_FRAME), eval(b).flags());
        B off = new B(goodScans(), false, false, false, 450, "DEFAULT", 0.25, "OFF",
                null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        assertEquals(Set.of(), eval(off).flags());
    }

    @Test
    void clockPoor() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "OFF",
                null, null, null, "SKIPPED", 900, -40, 80, -45, false);
        assertEquals(Set.of(Flag.CLOCK_POOR), eval(b).flags());
    }

    @Test
    void clockInconsistentOffsetDrift() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "OFF",
                null, null, null, "SKIPPED", 90, -40, 80, 70, false);
        assertEquals(Set.of(Flag.CLOCK_INCONSISTENT), eval(b).flags());
    }

    @Test
    void clockInconsistentMostScansSuspect() {
        B b = new B(List.of(scan(1000, 180, 0.02, true), scan(2000, 200, 0.02, true), scan(3000, 190, 0.02, false)),
                true, true, false, 450, "DEFAULT", 0.25, "OFF", null, null, null, "SKIPPED", 90, -40, 80, -45, false);
        assertEquals(Set.of(Flag.CLOCK_INCONSISTENT), eval(b).flags());
    }

    @Test
    void geoOk() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "FLAG",
                39.8913, 32.7836, 20.0, "OK", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(), d.flags());
        assertEquals(GeoState.OK, d.geoState());
        assertNotNull(d.geoDistanceM());
    }

    @Test
    void geoOutside() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "FLAG",
                39.9000, 32.7835, 20.0, "OK", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(Flag.GEO_OUTSIDE), d.flags());
        assertEquals(GeoState.OUTSIDE, d.geoState());
    }

    @Test
    void geoLowAccuracy() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "FLAG",
                39.8912, 32.7835, 400.0, "OK", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(Flag.GEO_LOW_ACCURACY), d.flags());
        assertEquals(GeoState.LOW_ACCURACY, d.geoState());
    }

    @Test
    void geoOutsideWinsOverLowAccuracy() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "FLAG",
                40.5, 32.7835, 400.0, "OK", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(Flag.GEO_OUTSIDE, Flag.GEO_LOW_ACCURACY), d.flags());
        assertEquals(GeoState.OUTSIDE, d.geoState());
    }

    @Test
    void geoUnavailable() {
        for (String state : new String[]{"DENIED", "UNSUPPORTED", "TIMEOUT", "SKIPPED", null}) {
            B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "FLAG",
                    null, null, null, state, 90, -40, 80, -45, false);
            Decision d = eval(b);
            assertEquals(Set.of(Flag.GEO_UNAVAILABLE), d.flags(), "state=" + state);
            assertEquals(GeoState.UNAVAILABLE, d.geoState());
        }
    }

    @Test
    void geoIgnoredWhenOff() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "OFF",
                45.0, 30.0, 999.0, "OK", 90, -40, 80, -45, false);
        Decision d = eval(b);
        assertEquals(Set.of(), d.flags());
        assertNull(d.geoDistanceM());
    }

    @Test
    void cameraReused() {
        B b = new B(goodScans(), true, true, false, 450, "DEFAULT", 0.25, "OFF",
                null, null, null, "SKIPPED", 90, -40, 80, -45, true);
        assertEquals(Set.of(Flag.CAMERA_REUSED), eval(b).flags());
    }
}
