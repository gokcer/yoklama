package com.yoklama.checkin;

import com.yoklama.session.ClassSession;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "checkin_attempt")
public class CheckinAttempt {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private ClassSession session;

    @Column(name = "student_no", nullable = false, length = 32)
    private String studentNo;

    @Column(name = "device_id", nullable = false, length = 32)
    private String deviceId;

    @Column(length = 64)
    private String ip;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AttemptState state;

    @Column(name = "result_code", length = 32)
    private String resultCode;

    @Column(name = "frame_path", length = 255)
    private String framePath;

    @Column(name = "frame_seq")
    private Integer frameSeq;

    @Column(name = "ble_nonce", length = 16)
    private String bleNonce;

    @Column(name = "ble_nonce_expires_ms")
    private Long bleNonceExpiresMs;

    @Column(name = "ble_verified", nullable = false)
    private boolean bleVerified;

    @Column(name = "sync1_offset_ms")
    private Integer sync1OffsetMs;

    @Column(name = "sync1_rtt_ms")
    private Integer sync1RttMs;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    protected CheckinAttempt() {}

    public CheckinAttempt(UUID id, ClassSession session, String studentNo, String deviceId,
                          String ip, String userAgent, Instant createdAt, Instant expiresAt) {
        this.id = id;
        this.session = session;
        this.studentNo = studentNo;
        this.deviceId = deviceId;
        this.ip = ip;
        this.userAgent = userAgent;
        this.state = AttemptState.SCANNING;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public UUID getId() { return id; }
    public ClassSession getSession() { return session; }
    public long getSessionId() { return session.getId(); }
    public String getStudentNo() { return studentNo; }
    public String getDeviceId() { return deviceId; }
    public String getIp() { return ip; }
    public String getUserAgent() { return userAgent; }
    public AttemptState getState() { return state; }
    public void setState(AttemptState state) { this.state = state; }
    public String getResultCode() { return resultCode; }
    public void setResultCode(String resultCode) { this.resultCode = resultCode; }
    public String getFramePath() { return framePath; }
    public void setFramePath(String framePath) { this.framePath = framePath; }
    public Integer getFrameSeq() { return frameSeq; }
    public void setFrameSeq(Integer frameSeq) { this.frameSeq = frameSeq; }
    public String getBleNonce() { return bleNonce; }
    public void setBleNonce(String bleNonce) { this.bleNonce = bleNonce; }
    public Long getBleNonceExpiresMs() { return bleNonceExpiresMs; }
    public void setBleNonceExpiresMs(Long bleNonceExpiresMs) { this.bleNonceExpiresMs = bleNonceExpiresMs; }
    public boolean isBleVerified() { return bleVerified; }
    public void setBleVerified(boolean bleVerified) { this.bleVerified = bleVerified; }
    public Integer getSync1OffsetMs() { return sync1OffsetMs; }
    public void setSync1OffsetMs(Integer sync1OffsetMs) { this.sync1OffsetMs = sync1OffsetMs; }
    public Integer getSync1RttMs() { return sync1RttMs; }
    public void setSync1RttMs(Integer sync1RttMs) { this.sync1RttMs = sync1RttMs; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
}
