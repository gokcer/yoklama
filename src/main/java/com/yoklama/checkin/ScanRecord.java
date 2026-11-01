package com.yoklama.checkin;

import jakarta.persistence.*;

@Entity
@Table(name = "scan_record")
public class ScanRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    private CheckinAttempt attempt;

    @Column(name = "raw_token", nullable = false, length = 64)
    private String rawToken;

    private Integer seq;

    @Column(name = "ts_ms")
    private Long tsMs;

    @Column(name = "first_seen_server_ms", nullable = false)
    private long firstSeenServerMs;

    @Column(name = "arrival_ms", nullable = false)
    private long arrivalMs;

    @Column(name = "frame_time_source", nullable = false, length = 16)
    private String frameTimeSource;

    @Column(name = "frame_w", nullable = false)
    private int frameW;

    @Column(name = "frame_h", nullable = false)
    private int frameH;

    @Column(length = 400)
    private String corners;

    @Column(name = "area_ratio")
    private Double areaRatio;

    @Column(nullable = false)
    private boolean valid;

    @Column(length = 32)
    private String reason;

    @Column(name = "clock_suspect", nullable = false)
    private boolean clockSuspect;

    @Column(nullable = false)
    private boolean duplicate;

    protected ScanRecord() {}

    public ScanRecord(CheckinAttempt attempt, String rawToken, long firstSeenServerMs,
                      long arrivalMs, String frameTimeSource, int frameW, int frameH) {
        this.attempt = attempt;
        this.rawToken = rawToken;
        this.firstSeenServerMs = firstSeenServerMs;
        this.arrivalMs = arrivalMs;
        this.frameTimeSource = frameTimeSource;
        this.frameW = frameW;
        this.frameH = frameH;
    }

    public Long getId() { return id; }
    public CheckinAttempt getAttempt() { return attempt; }
    public String getRawToken() { return rawToken; }
    public Integer getSeq() { return seq; }
    public void setSeq(Integer seq) { this.seq = seq; }
    public Long getTsMs() { return tsMs; }
    public void setTsMs(Long tsMs) { this.tsMs = tsMs; }
    public long getFirstSeenServerMs() { return firstSeenServerMs; }
    public long getArrivalMs() { return arrivalMs; }
    public String getFrameTimeSource() { return frameTimeSource; }
    public int getFrameW() { return frameW; }
    public int getFrameH() { return frameH; }
    public String getCorners() { return corners; }
    public void setCorners(String corners) { this.corners = corners; }
    public Double getAreaRatio() { return areaRatio; }
    public void setAreaRatio(Double areaRatio) { this.areaRatio = areaRatio; }
    public boolean isValid() { return valid; }
    public void setValid(boolean valid) { this.valid = valid; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public boolean isClockSuspect() { return clockSuspect; }
    public void setClockSuspect(boolean clockSuspect) { this.clockSuspect = clockSuspect; }
    public boolean isDuplicate() { return duplicate; }
    public void setDuplicate(boolean duplicate) { this.duplicate = duplicate; }
}
