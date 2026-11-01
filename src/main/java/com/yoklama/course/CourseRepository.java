package com.yoklama.course;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CourseRepository extends JpaRepository<Course, Long> {
    List<Course> findByOwner_IdOrderByCodeAsc(long ownerId);
    List<Course> findAllByOrderByCodeAsc();
    boolean existsByOwner_IdAndCode(long ownerId, String code);
    boolean existsByOwner_IdAndCodeAndIdNot(long ownerId, String code, long id);
}
