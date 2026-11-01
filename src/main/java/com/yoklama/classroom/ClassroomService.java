package com.yoklama.classroom;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.security.CurrentTeacher;
import com.yoklama.session.ClassSessionRepository;
import com.yoklama.teacher.TeacherRole;
import com.yoklama.teacher.TeacherUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

@Service
public class ClassroomService {

    private final ClassroomRepository repo;
    private final ClassSessionRepository sessionRepo;
    private final CurrentTeacher currentTeacher;
    private final SecureRandom random = new SecureRandom();

    public ClassroomService(ClassroomRepository repo, ClassSessionRepository sessionRepo,
                            CurrentTeacher currentTeacher) {
        this.repo = repo;
        this.sessionRepo = sessionRepo;
        this.currentTeacher = currentTeacher;
    }

    public record ClassroomData(String name, Double latitude, Double longitude, Integer radiusM, String bleBeaconId) {}

    @Transactional(readOnly = true)
    public List<Classroom> list() {
        TeacherUser teacher = currentTeacher.get();
        if (teacher.getRole() == TeacherRole.ADMIN) return repo.findAllByOrderByNameAsc();
        return repo.findByOwner_IdOrderByNameAsc(teacher.getId());
    }

    @Transactional(readOnly = true)
    public Classroom get(long id) {
        Classroom c = repo.findById(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        currentTeacher.requireOwner(c.getOwnerId());
        return c;
    }

    @Transactional
    public Classroom create(ClassroomData data) {
        Classroom c = new Classroom(currentTeacher.get(), data.name().trim());
        apply(c, data);
        return repo.save(c);
    }

    @Transactional
    public Classroom update(long id, ClassroomData data) {
        Classroom c = get(id);
        c.setName(data.name().trim());
        apply(c, data);
        return repo.save(c);
    }

    private static void apply(Classroom c, ClassroomData d) {
        boolean anyGeo = d.latitude() != null || d.longitude() != null || d.radiusM() != null;
        boolean allGeo = d.latitude() != null && d.longitude() != null && d.radiusM() != null;
        if (anyGeo && !allGeo) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    Map.of("latitude", "Enlem, boylam ve yarıçap birlikte girilmeli"));
        }
        String beaconId = d.bleBeaconId() != null && !d.bleBeaconId().isBlank() ? d.bleBeaconId().trim() : null;
        c.setLatitude(d.latitude());
        c.setLongitude(d.longitude());
        c.setRadiusM(d.radiusM());
        c.setBleBeaconId(beaconId);
    }

    @Transactional
    public void delete(long id) {
        Classroom c = get(id);
        if (sessionRepo.existsByClassroomId(id)) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        repo.delete(c);
    }

    @Transactional
    public Classroom generateBleKey(long id) {
        Classroom c = get(id);
        byte[] key = new byte[32];
        random.nextBytes(key);
        c.setBleKeyHex(HexFormat.of().formatHex(key));
        return repo.save(c);
    }
}
