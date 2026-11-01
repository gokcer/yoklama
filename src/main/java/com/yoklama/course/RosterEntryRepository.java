package com.yoklama.course;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RosterEntryRepository extends JpaRepository<RosterEntry, Long> {
    List<RosterEntry> findByCourseIdOrderByStudentNoAsc(long courseId);
    Optional<RosterEntry> findByCourseIdAndStudentNo(long courseId, String studentNo);
    boolean existsByCourseIdAndStudentNo(long courseId, String studentNo);
    long countByCourseId(long courseId);

    /**
     * Bulk delete executed immediately. A derived {@code deleteBy...} would queue entity deletes that
     * Hibernate flushes after the replacement inserts, violating {@code uq_roster} on REPLACE imports.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from RosterEntry r where r.course.id = :courseId")
    int deleteAllByCourseId(@Param("courseId") long courseId);
}
