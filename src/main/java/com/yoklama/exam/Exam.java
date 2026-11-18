package com.yoklama.exam;

import com.yoklama.course.Course;
import jakarta.persistence.*;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "exam")
public class Exam {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(name = "exam_date")
    private LocalDate examDate;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Exam() {}

    public Exam(Course course, String title, LocalDate examDate, Instant createdAt) {
        this.course = course;
        this.title = title;
        this.examDate = examDate;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public Course getCourse() { return course; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public LocalDate getExamDate() { return examDate; }
    public void setExamDate(LocalDate examDate) { this.examDate = examDate; }
    public Instant getCreatedAt() { return createdAt; }
}
