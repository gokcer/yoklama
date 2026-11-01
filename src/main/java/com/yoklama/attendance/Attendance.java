package com.yoklama.attendance;

import com.yoklama.decision.Flag;
import com.yoklama.session.ClassSession;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "attendance")
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ClassSession session;

    @Column(name = "student_no", nullable = false, length = 32)
    private String studentNo;

    @Column(name = "full_name", length = 200)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AttendanceSource source;

    @Column(name = "attempt_id")
    private UUID attemptId;

    @Column(name = "device_id", length = 32)
    private String deviceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AttendanceStatus status;

    @Convert(converter = FlagSetConverter.class)
    @Column(nullable = false, length = 500)
    private Set<Flag> flags = EnumSet.noneOf(Flag.class);

    @Column(name = "min_latency_ms")
    private Integer minLatencyMs;

    @Column(name = "latency_threshold_ms")
    private Integer latencyThresholdMs;

    @Column(name = "threshold_source", length = 16)
    private String thresholdSource;

    @Column(name = "area_ratio_max")
    private Double areaRatioMax;

    @Column(name = "area_threshold")
    private Double areaThreshold;

    @Enumerated(EnumType.STRING)
    @Column(name = "geo_state", nullable = false, length = 16)
    private GeoState geoState = GeoState.OFF;

    @Column(name = "geo_lat")
    private Double geoLat;

    @Column(name = "geo_lng")
    private Double geoLng;

    @Column(name = "geo_accuracy_m")
    private Double geoAccuracyM;

    @Column(name = "geo_distance_m")
    private Double geoDistanceM;

    @Column(name = "clock_offset_ms")
    private Integer clockOffsetMs;

    @Column(name = "clock_rtt_ms")
    private Integer clockRttMs;

    @Column(name = "camera_id_hash", length = 64)
    private String cameraIdHash;

    @Column(name = "camera_label", length = 200)
    private String cameraLabel;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "ble_verified", nullable = false)
    private boolean bleVerified;

    @Column(name = "frame_path", length = 255)
    private String framePath;

    @Enumerated(EnumType.STRING)
    @Column(name = "teacher_decision", nullable = false, length = 16)
    private TeacherDecision teacherDecision = TeacherDecision.NONE;

    @Column(name = "teacher_note", length = 500)
    private String teacherNote;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Attendance() {}

    public Attendance(ClassSession session, String studentNo, AttendanceSource source, AttendanceStatus status,
                      Instant createdAt) {
        this.session = session;
        this.studentNo = studentNo;
        this.source = source;
        this.status = status;
        this.createdAt = createdAt;
    }

    // Getters and setters
    public Long getId() { return id; }
    public ClassSession getSession() { return session; }
    public long getSessionId() { return session.getId(); }
    public String getStudentNo() { return studentNo; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    public AttendanceSource getSource() { return source; }
    public UUID getAttemptId() { return attemptId; }
    public void setAttemptId(UUID attemptId) { this.attemptId = attemptId; }
    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public AttendanceStatus getStatus() { return status; }
    public void setStatus(AttendanceStatus status) { this.status = status; }
    public Set<Flag> getFlags() { return flags; }
    public void setFlags(Set<Flag> flags) { this.flags = flags; }
    public Integer getMinLatencyMs() { return minLatencyMs; }
    public void setMinLatencyMs(Integer minLatencyMs) { this.minLatencyMs = minLatencyMs; }
    public Integer getLatencyThresholdMs() { return latencyThresholdMs; }
    public void setLatencyThresholdMs(Integer latencyThresholdMs) { this.latencyThresholdMs = latencyThresholdMs; }
    public String getThresholdSource() { return thresholdSource; }
    public void setThresholdSource(String thresholdSource) { this.thresholdSource = thresholdSource; }
    public Double getAreaRatioMax() { return areaRatioMax; }
    public void setAreaRatioMax(Double areaRatioMax) { this.areaRatioMax = areaRatioMax; }
    public Double getAreaThreshold() { return areaThreshold; }
    public void setAreaThreshold(Double areaThreshold) { this.areaThreshold = areaThreshold; }
    public GeoState getGeoState() { return geoState; }
    public void setGeoState(GeoState geoState) { this.geoState = geoState; }
    public Double getGeoLat() { return geoLat; }
    public void setGeoLat(Double geoLat) { this.geoLat = geoLat; }
    public Double getGeoLng() { return geoLng; }
    public void setGeoLng(Double geoLng) { this.geoLng = geoLng; }
    public Double getGeoAccuracyM() { return geoAccuracyM; }
    public void setGeoAccuracyM(Double geoAccuracyM) { this.geoAccuracyM = geoAccuracyM; }
    public Double getGeoDistanceM() { return geoDistanceM; }
    public void setGeoDistanceM(Double geoDistanceM) { this.geoDistanceM = geoDistanceM; }
    public Integer getClockOffsetMs() { return clockOffsetMs; }
    public void setClockOffsetMs(Integer clockOffsetMs) { this.clockOffsetMs = clockOffsetMs; }
    public Integer getClockRttMs() { return clockRttMs; }
    public void setClockRttMs(Integer clockRttMs) { this.clockRttMs = clockRttMs; }
    public String getCameraIdHash() { return cameraIdHash; }
    public void setCameraIdHash(String cameraIdHash) { this.cameraIdHash = cameraIdHash; }
    public String getCameraLabel() { return cameraLabel; }
    public void setCameraLabel(String cameraLabel) { this.cameraLabel = cameraLabel; }
    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }
    public boolean isBleVerified() { return bleVerified; }
    public void setBleVerified(boolean bleVerified) { this.bleVerified = bleVerified; }
    public String getFramePath() { return framePath; }
    public void setFramePath(String framePath) { this.framePath = framePath; }
    public TeacherDecision getTeacherDecision() { return teacherDecision; }
    public void setTeacherDecision(TeacherDecision teacherDecision) { this.teacherDecision = teacherDecision; }
    public String getTeacherNote() { return teacherNote; }
    public void setTeacherNote(String teacherNote) { this.teacherNote = teacherNote; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public Instant getCreatedAt() { return createdAt; }

    public boolean isPresent() {
        return teacherDecision == TeacherDecision.APPROVED
                || (teacherDecision == TeacherDecision.NONE && status == AttendanceStatus.ACCEPTED);
    }

    public boolean isPending() {
        return status == AttendanceStatus.FLAGGED && teacherDecision == TeacherDecision.NONE;
    }
}
