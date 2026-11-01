package com.yoklama.attendance;

import com.yoklama.decision.Flag;

import java.util.List;

public record AttendanceDto(long id, String studentNo, String fullName, String source,
                            String status, List<String> flags, String teacherDecision,
                            boolean present, boolean pending,
                            Integer minLatencyMs, Integer latencyThresholdMs, String thresholdSource,
                            Double areaRatioMax, Double areaThreshold,
                            String geoState, Double geoDistanceM, Double geoAccuracyM,
                            Integer clockRttMs, boolean bleVerified, boolean hasFrame,
                            String userAgent, String cameraLabel,
                            String teacherNote, String createdAt, String decidedAt) {

    public static AttendanceDto from(Attendance a) {
        return new AttendanceDto(a.getId(), a.getStudentNo(), a.getFullName(),
                a.getSource().name(), a.getStatus().name(),
                a.getFlags().stream().sorted().map(Flag::name).toList(),
                a.getTeacherDecision().name(), a.isPresent(), a.isPending(),
                a.getMinLatencyMs(), a.getLatencyThresholdMs(), a.getThresholdSource(),
                a.getAreaRatioMax(), a.getAreaThreshold(),
                a.getGeoState().name(), a.getGeoDistanceM(), a.getGeoAccuracyM(),
                a.getClockRttMs(), a.isBleVerified(), a.getFramePath() != null,
                a.getUserAgent(), a.getCameraLabel(),
                a.getTeacherNote(), a.getCreatedAt().toString(),
                a.getDecidedAt() != null ? a.getDecidedAt().toString() : null);
    }
}
