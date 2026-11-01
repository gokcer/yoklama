package com.yoklama.classroom;

import com.yoklama.teacher.TeacherUser;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "classroom")
public class Classroom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private TeacherUser owner;

    @Column(nullable = false, length = 120)
    private String name;

    private Double latitude;
    private Double longitude;

    @Column(name = "radius_m")
    private Integer radiusM;

    @Column(name = "ble_beacon_id", length = 16)
    private String bleBeaconId;

    @Column(name = "ble_key_hex", length = 64)
    private String bleKeyHex;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Classroom() {}

    public Classroom(TeacherUser owner, String name) {
        this.owner = owner;
        this.name = name;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public TeacherUser getOwner() { return owner; }
    public Long getOwnerId() { return owner.getId(); }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Double getLatitude() { return latitude; }
    public void setLatitude(Double latitude) { this.latitude = latitude; }
    public Double getLongitude() { return longitude; }
    public void setLongitude(Double longitude) { this.longitude = longitude; }
    public Integer getRadiusM() { return radiusM; }
    public void setRadiusM(Integer radiusM) { this.radiusM = radiusM; }
    public String getBleBeaconId() { return bleBeaconId; }
    public void setBleBeaconId(String bleBeaconId) { this.bleBeaconId = bleBeaconId; }
    public String getBleKeyHex() { return bleKeyHex; }
    public void setBleKeyHex(String bleKeyHex) { this.bleKeyHex = bleKeyHex; }
    public Instant getCreatedAt() { return createdAt; }
}
