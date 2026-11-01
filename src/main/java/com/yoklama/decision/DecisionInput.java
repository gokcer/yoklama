package com.yoklama.decision;

import com.yoklama.checkin.ScanRecord;

import java.util.List;

/**
 * Everything {@link DecisionEngine} needs; prepared by the caller so the engine stays a pure function.
 *
 * @param validScans valid, non-duplicate scans of the attempt
 */
public record DecisionInput(
        List<ScanRecord> validScans,
        boolean frameUploaded,
        boolean frameCaptureEnabled,
        boolean bleVerified,
        boolean bleClearsLatency,
        int latencyThresholdMs,
        String thresholdSource,
        double areaThreshold,
        String geoMode,
        Double geoLat,
        Double geoLng,
        Double geoAccuracyM,
        String geoState,
        Double classroomLat,
        Double classroomLng,
        Integer classroomRadiusM,
        int maxGeoAccuracyM,
        Integer sync1RttMs,
        Integer sync1OffsetMs,
        Integer sync2RttMs,
        Integer sync2OffsetMs,
        int maxClockRttMs,
        boolean cameraReused
) {}
