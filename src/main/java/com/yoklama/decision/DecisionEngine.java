package com.yoklama.decision;

import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.GeoState;
import com.yoklama.checkin.ScanRecord;
import org.springframework.stereotype.Component;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

/**
 * Soft-flag evaluation of 07 §2–3. Hard rejections (07 §1) are checked by the caller before this runs.
 */
@Component
public class DecisionEngine {

    static final int MAX_OFFSET_DRIFT_MS = 100;

    public Decision evaluate(DecisionInput input) {
        Set<Flag> flags = EnumSet.noneOf(Flag.class);

        List<ScanRecord> scans = input.validScans();
        List<ScanRecord> nonSuspect = scans.stream().filter(s -> !s.isClockSuspect()).toList();
        List<ScanRecord> latencyScans = nonSuspect.isEmpty() ? scans : nonSuspect;

        Integer minLatencyMs = latencyScans.stream()
                .filter(s -> s.getTsMs() != null)
                .mapToLong(s -> s.getFirstSeenServerMs() - s.getTsMs())
                .min()
                .stream().mapToObj(v -> (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, v)))
                .findFirst().orElse(null);

        Double areaRatioMax = scans.stream()
                .filter(s -> s.getAreaRatio() != null)
                .mapToDouble(ScanRecord::getAreaRatio)
                .max().stream().boxed().findFirst().orElse(null);

        boolean bleSuppresses = input.bleVerified() && input.bleClearsLatency();
        if (!bleSuppresses) {
            if (minLatencyMs != null && minLatencyMs > input.latencyThresholdMs()) {
                flags.add(Flag.LATENCY_HIGH);
            }
            if (areaRatioMax != null && areaRatioMax > input.areaThreshold()) {
                flags.add(Flag.SCREEN_SUSPECT);
            }
        }

        if (input.frameCaptureEnabled() && !input.frameUploaded()) {
            flags.add(Flag.NO_FRAME);
        }

        int maxRtt = Math.max(
                input.sync1RttMs() != null ? input.sync1RttMs() : 0,
                input.sync2RttMs() != null ? input.sync2RttMs() : 0);
        if (maxRtt > input.maxClockRttMs()) {
            flags.add(Flag.CLOCK_POOR);
        }

        boolean clockInconsistent = input.sync1OffsetMs() != null && input.sync2OffsetMs() != null
                && Math.abs((long) input.sync2OffsetMs() - input.sync1OffsetMs()) > MAX_OFFSET_DRIFT_MS;
        long suspectCount = scans.stream().filter(ScanRecord::isClockSuspect).count();
        if (!scans.isEmpty() && suspectCount > scans.size() / 2.0) {
            clockInconsistent = true;
        }
        if (clockInconsistent) flags.add(Flag.CLOCK_INCONSISTENT);

        Double geoDistanceM = computeGeoDistance(input);
        GeoState geoState = computeGeoState(input, geoDistanceM, flags);

        if (input.cameraReused()) {
            flags.add(Flag.CAMERA_REUSED);
        }

        Integer clockOffsetMs = input.sync2OffsetMs() != null ? input.sync2OffsetMs() : input.sync1OffsetMs();
        Integer clockRttMs = input.sync2RttMs() != null ? input.sync2RttMs() : input.sync1RttMs();

        AttendanceStatus status = flags.isEmpty() ? AttendanceStatus.ACCEPTED : AttendanceStatus.FLAGGED;

        return new Decision(status, flags, minLatencyMs, input.latencyThresholdMs(),
                input.thresholdSource(), areaRatioMax, input.areaThreshold(),
                geoState, geoDistanceM, "FLAG".equals(input.geoMode()) ? input.geoAccuracyM() : null,
                clockOffsetMs, clockRttMs);
    }

    private GeoState computeGeoState(DecisionInput input, Double distance, Set<Flag> flags) {
        if (!"FLAG".equals(input.geoMode())) return GeoState.OFF;

        // With geoMode=FLAG anything but a usable position (denied, timeout, missing, or a client that
        // claims SKIPPED) counts as unavailable.
        if (!"OK".equals(input.geoState()) || input.geoLat() == null || input.geoLng() == null) {
            flags.add(Flag.GEO_UNAVAILABLE);
            return GeoState.UNAVAILABLE;
        }

        double accuracy = input.geoAccuracyM() != null ? input.geoAccuracyM() : 0;
        boolean lowAccuracy = input.geoAccuracyM() == null || accuracy > input.maxGeoAccuracyM();
        if (lowAccuracy) flags.add(Flag.GEO_LOW_ACCURACY);

        if (distance != null && input.classroomRadiusM() != null
                && distance - accuracy > input.classroomRadiusM()) {
            flags.add(Flag.GEO_OUTSIDE);
            return GeoState.OUTSIDE;
        }
        return lowAccuracy ? GeoState.LOW_ACCURACY : GeoState.OK;
    }

    private Double computeGeoDistance(DecisionInput input) {
        if (!"FLAG".equals(input.geoMode()) || input.geoLat() == null || input.geoLng() == null
                || input.classroomLat() == null || input.classroomLng() == null) {
            return null;
        }
        return GeoMath.haversineMeters(input.geoLat(), input.geoLng(),
                input.classroomLat(), input.classroomLng());
    }
}
