package com.yoklama.attendance;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AttendanceRepository extends JpaRepository<Attendance, Long> {
    List<Attendance> findBySession_IdOrderByCreatedAtDesc(long sessionId);
    Optional<Attendance> findByIdAndSession_Id(long id, long sessionId);
    boolean existsBySession_IdAndStudentNo(long sessionId, String studentNo);
    boolean existsBySession_IdAndDeviceId(long sessionId, String deviceId);
    boolean existsBySession_IdAndCameraIdHashAndStudentNoNot(long sessionId, String cameraIdHash, String studentNo);
    long countBySession_Id(long sessionId);
    long countBySession_IdAndStatusAndTeacherDecision(long sessionId, AttendanceStatus status, TeacherDecision decision);

    @Modifying
    @Query("update Attendance a set a.framePath = null where a.session.id in :sessionIds and a.framePath is not null")
    int clearFramePaths(@Param("sessionIds") Collection<Long> sessionIds);
}
