package com.yoklama.course;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.config.AppProperties;
import com.yoklama.security.CurrentTeacher;
import com.yoklama.session.ClassSessionRepository;
import com.yoklama.teacher.TeacherRole;
import com.yoklama.teacher.TeacherUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class CourseService {

    private final CourseRepository courseRepo;
    private final RosterEntryRepository rosterRepo;
    private final ClassSessionRepository sessionRepo;
    private final CurrentTeacher currentTeacher;
    private final Pattern studentNoPattern;

    public CourseService(CourseRepository courseRepo, RosterEntryRepository rosterRepo,
                         ClassSessionRepository sessionRepo, CurrentTeacher currentTeacher,
                         AppProperties props) {
        this.courseRepo = courseRepo;
        this.rosterRepo = rosterRepo;
        this.sessionRepo = sessionRepo;
        this.currentTeacher = currentTeacher;
        this.studentNoPattern = Pattern.compile(props.checkin().studentNoPattern());
    }

    @Transactional(readOnly = true)
    public List<Course> list() {
        TeacherUser teacher = currentTeacher.get();
        if (teacher.getRole() == TeacherRole.ADMIN) return courseRepo.findAllByOrderByCodeAsc();
        return courseRepo.findByOwner_IdOrderByCodeAsc(teacher.getId());
    }

    @Transactional(readOnly = true)
    public Course get(long id) {
        Course c = courseRepo.findById(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        currentTeacher.requireOwner(c.getOwnerId());
        return c;
    }

    @Transactional
    public Course create(String code, String name) {
        TeacherUser teacher = currentTeacher.get();
        String c = code.trim();
        if (courseRepo.existsByOwner_IdAndCode(teacher.getId(), c)) {
            throw new ApiException(ErrorCode.CONFLICT, Map.of("code", "Bu ders kodu zaten var"));
        }
        return courseRepo.save(new Course(teacher, c, name.trim()));
    }

    @Transactional
    public Course update(long id, String code, String name) {
        Course course = get(id);
        String c = code.trim();
        if (courseRepo.existsByOwner_IdAndCodeAndIdNot(course.getOwnerId(), c, id)) {
            throw new ApiException(ErrorCode.CONFLICT, Map.of("code", "Bu ders kodu zaten var"));
        }
        course.setCode(c);
        course.setName(name.trim());
        return courseRepo.save(course);
    }

    @Transactional
    public void delete(long id) {
        Course c = get(id);
        if (sessionRepo.existsByCourseId(id)) {
            throw new ApiException(ErrorCode.CONFLICT);
        }
        courseRepo.delete(c);
    }

    @Transactional(readOnly = true)
    public List<RosterEntry> roster(long courseId) {
        get(courseId);
        return rosterRepo.findByCourseIdOrderByStudentNoAsc(courseId);
    }

    @Transactional(readOnly = true)
    public long rosterCount(long courseId) {
        return rosterRepo.countByCourseId(courseId);
    }

    @Transactional
    public RosterEntry addRosterEntry(long courseId, String studentNo, String fullName) {
        Course c = get(courseId);
        String no = studentNo.trim();
        if (!studentNoPattern.matcher(no).matches()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("studentNo", "Geçersiz format"));
        }
        if (rosterRepo.existsByCourseIdAndStudentNo(courseId, no)) {
            throw new ApiException(ErrorCode.CONFLICT, Map.of("studentNo", "Bu öğrenci zaten listede"));
        }
        return rosterRepo.save(new RosterEntry(c, no, fullName.trim()));
    }

    @Transactional
    public void removeRosterEntry(long courseId, String studentNo) {
        get(courseId);
        rosterRepo.findByCourseIdAndStudentNo(courseId, studentNo)
                .ifPresent(rosterRepo::delete);
    }
}
