package com.yoklama.session;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "calibration_run")
public class CalibrationRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ClassSession session;

    @Column(nullable = false, length = 32)
    private String label;

    @Column(name = "min_latency_ms", nullable = false)
    private int minLatencyMs;

    @Column(name = "max_area_ratio", nullable = false)
    private double maxAreaRatio;

    @Column(name = "valid_scan_count", nullable = false)
    private int validScanCount;

    @Column(name = "clock_rtt_ms", nullable = false)
    private int clockRttMs;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CalibrationRun() {}

    public CalibrationRun(ClassSession session, String label, int minLatencyMs,
                          double maxAreaRatio, int validScanCount, int clockRttMs, Instant createdAt) {
        this.session = session;
        this.label = label;
        this.minLatencyMs = minLatencyMs;
        this.maxAreaRatio = maxAreaRatio;
        this.validScanCount = validScanCount;
        this.clockRttMs = clockRttMs;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public ClassSession getSession() { return session; }
    public String getLabel() { return label; }
    public int getMinLatencyMs() { return minLatencyMs; }
    public double getMaxAreaRatio() { return maxAreaRatio; }
    public int getValidScanCount() { return validScanCount; }
    public int getClockRttMs() { return clockRttMs; }
    public Instant getCreatedAt() { return createdAt; }
}
