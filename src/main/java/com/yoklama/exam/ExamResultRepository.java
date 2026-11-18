package com.yoklama.exam;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ExamResultRepository extends JpaRepository<ExamResult, Long> {

    long countByExam_Id(long examId);

    Optional<ExamResult> findByExam_IdAndStudentNo(long examId, String studentNo);

    @Query("select r from ExamResult r where r.exam.id = :examId order by r.studentNo")
    List<ExamResult> findByExamId(@Param("examId") long examId);

    @Query("select r from ExamResult r where r.exam.id in :examIds order by r.studentNo")
    List<ExamResult> findByExamIds(@Param("examIds") Collection<Long> examIds);
}
