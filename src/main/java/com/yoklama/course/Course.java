package com.yoklama.course;

import com.yoklama.teacher.TeacherUser;
import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "course")
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Eager: ownership checks read owner outside transactions (open-in-view is off).
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "owner_id", nullable = false)
    private TeacherUser owner;

    @Column(nullable = false, length = 32)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Course() {}

    public Course(TeacherUser owner, String code, String name) {
        this.owner = owner;
        this.code = code;
        this.name = name;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public TeacherUser getOwner() { return owner; }
    public Long getOwnerId() { return owner.getId(); }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Instant getCreatedAt() { return createdAt; }
}
