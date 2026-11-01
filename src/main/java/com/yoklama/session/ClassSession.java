package com.yoklama.session;

import com.yoklama.classroom.Classroom;
import com.yoklama.course.Course;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "class_session")
public class ClassSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Eager: DTO mapping happens outside transactions (open-in-view is off).
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "classroom_id")
    private Classroom classroom;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, length = 6)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private SessionStatus status;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    @Column(name = "refresh_ms", nullable = false)
    private int refreshMs;

    @Column(name = "required_scans", nullable = false)
    private int requiredScans;

    @Column(name = "max_span_slots", nullable = false)
    private int maxSpanSlots;

    @Column(name = "max_token_age_ms", nullable = false)
    private int maxTokenAgeMs;

    @Column(name = "latency_margin_ms", nullable = false)
    private int latencyMarginMs;

    @Column(name = "default_latency_threshold_ms", nullable = false)
    private int defaultLatencyThresholdMs;

    @Column(name = "screen_area_ratio_threshold", nullable = false)
    private double screenAreaRatioThreshold;

    @Column(name = "require_roster", nullable = false)
    private boolean requireRoster;

    @Enumerated(EnumType.STRING)
    @Column(name = "geo_mode", nullable = false, length = 16)
    private GeoMode geoMode;

    @Enumerated(EnumType.STRING)
    @Column(name = "ble_mode", nullable = false, length = 16)
    private BleMode bleMode;

    @Column(name = "frame_capture", nullable = false)
    private boolean frameCapture;

    @Column(name = "epoch_start_ms")
    private Long epochStartMs;

    @Column(name = "opened_at")
    private Instant openedAt;

    @Column(name = "closes_at")
    private Instant closesAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @Column(name = "baseline_latency_ms")
    private Integer baselineLatencyMs;

    @Column(name = "baseline_area_ratio_max")
    private Double baselineAreaRatioMax;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected ClassSession() {}

    public ClassSession(Course course, String title, String code, Instant createdAt) {
        this.course = course;
        this.title = title;
        this.code = code;
        this.status = SessionStatus.DRAFT;
        this.createdAt = createdAt;
    }

    // Getters
    public Long getId() { return id; }
    public Course getCourse() { return course; }
    public Classroom getClassroom() { return classroom; }
    public void setClassroom(Classroom classroom) { this.classroom = classroom; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public SessionStatus getStatus() { return status; }
    public void setStatus(SessionStatus status) { this.status = status; }
    public int getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(int durationMinutes) { this.durationMinutes = durationMinutes; }
    public int getRefreshMs() { return refreshMs; }
    public void setRefreshMs(int refreshMs) { this.refreshMs = refreshMs; }
    public int getRequiredScans() { return requiredScans; }
    public void setRequiredScans(int requiredScans) { this.requiredScans = requiredScans; }
    public int getMaxSpanSlots() { return maxSpanSlots; }
    public void setMaxSpanSlots(int maxSpanSlots) { this.maxSpanSlots = maxSpanSlots; }
    public int getMaxTokenAgeMs() { return maxTokenAgeMs; }
    public void setMaxTokenAgeMs(int maxTokenAgeMs) { this.maxTokenAgeMs = maxTokenAgeMs; }
    public int getLatencyMarginMs() { return latencyMarginMs; }
    public void setLatencyMarginMs(int latencyMarginMs) { this.latencyMarginMs = latencyMarginMs; }
    public int getDefaultLatencyThresholdMs() { return defaultLatencyThresholdMs; }
    public void setDefaultLatencyThresholdMs(int v) { this.defaultLatencyThresholdMs = v; }
    public double getScreenAreaRatioThreshold() { return screenAreaRatioThreshold; }
    public void setScreenAreaRatioThreshold(double v) { this.screenAreaRatioThreshold = v; }
    public boolean isRequireRoster() { return requireRoster; }
    public void setRequireRoster(boolean requireRoster) { this.requireRoster = requireRoster; }
    public GeoMode getGeoMode() { return geoMode; }
    public void setGeoMode(GeoMode geoMode) { this.geoMode = geoMode; }
    public BleMode getBleMode() { return bleMode; }
    public void setBleMode(BleMode bleMode) { this.bleMode = bleMode; }
    public boolean isFrameCapture() { return frameCapture; }
    public void setFrameCapture(boolean frameCapture) { this.frameCapture = frameCapture; }
    public Long getEpochStartMs() { return epochStartMs; }
    public void setEpochStartMs(Long epochStartMs) { this.epochStartMs = epochStartMs; }
    public Instant getOpenedAt() { return openedAt; }
    public void setOpenedAt(Instant openedAt) { this.openedAt = openedAt; }
    public Instant getClosesAt() { return closesAt; }
    public void setClosesAt(Instant closesAt) { this.closesAt = closesAt; }
    public Instant getClosedAt() { return closedAt; }
    public void setClosedAt(Instant closedAt) { this.closedAt = closedAt; }
    public Integer getBaselineLatencyMs() { return baselineLatencyMs; }
    public void setBaselineLatencyMs(Integer baselineLatencyMs) { this.baselineLatencyMs = baselineLatencyMs; }
    public Double getBaselineAreaRatioMax() { return baselineAreaRatioMax; }
    public void setBaselineAreaRatioMax(Double v) { this.baselineAreaRatioMax = v; }
    public Instant getCreatedAt() { return createdAt; }
}
