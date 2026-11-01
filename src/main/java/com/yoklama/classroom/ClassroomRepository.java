package com.yoklama.classroom;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ClassroomRepository extends JpaRepository<Classroom, Long> {
    List<Classroom> findByOwner_IdOrderByNameAsc(long ownerId);
    List<Classroom> findAllByOrderByNameAsc();
}
