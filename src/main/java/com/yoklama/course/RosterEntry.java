package com.yoklama.course;

import jakarta.persistence.*;

@Entity
@Table(name = "roster_entry")
public class RosterEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "student_no", nullable = false, length = 32)
    private String studentNo;

    @Column(name = "full_name", nullable = false, length = 200)
    private String fullName;

    protected RosterEntry() {}

    public RosterEntry(Course course, String studentNo, String fullName) {
        this.course = course;
        this.studentNo = studentNo;
        this.fullName = fullName;
    }

    public Long getId() { return id; }
    public Course getCourse() { return course; }
    public String getStudentNo() { return studentNo; }
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
}
