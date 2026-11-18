package com.yoklama.exam;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {

    @Query("select q from ExamQuestion q where q.exam.id = :examId order by q.position, q.id")
    List<ExamQuestion> findByExamId(@Param("examId") long examId);

    @Query("select q from ExamQuestion q where q.exam.id in :examIds order by q.exam.id, q.position, q.id")
    List<ExamQuestion> findByExamIds(@Param("examIds") Collection<Long> examIds);
}
