package com.yoklama.teacher;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TeacherUserRepository extends JpaRepository<TeacherUser, Long> {
    Optional<TeacherUser> findByUsername(String username);
    boolean existsByUsername(String username);
}
