package com.yoklama.exam;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ExamAnswerRepository extends JpaRepository<ExamAnswer, Long> {

    @Query("select a from ExamAnswer a where a.result.id = :resultId")
    List<ExamAnswer> findByResultId(@Param("resultId") long resultId);

    @Query("select a from ExamAnswer a where a.question.id in :questionIds")
    List<ExamAnswer> findByQuestionIds(@Param("questionIds") Collection<Long> questionIds);

    @Query("select a from ExamAnswer a where a.result.exam.id in :examIds")
    List<ExamAnswer> findByExamIds(@Param("examIds") Collection<Long> examIds);

    /**
     * Bulk delete executed immediately (pending changes are flushed first). The persistence context
     * is not cleared so that callers can keep working with the entities they already loaded.
     */
    @Modifying(flushAutomatically = true)
    @Query("delete from ExamAnswer a where a.question.id in :questionIds")
    int deleteByQuestionIds(@Param("questionIds") Collection<Long> questionIds);
}
