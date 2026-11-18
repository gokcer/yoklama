package com.yoklama.exam;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamRepository extends JpaRepository<Exam, Long> {
    List<Exam> findByCourse_Id(long courseId);
    boolean existsByCourse_Id(long courseId);
}
