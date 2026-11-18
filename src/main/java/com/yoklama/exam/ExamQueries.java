package com.yoklama.exam;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.exam.ExamDtos.ExamSummaryDto;
import com.yoklama.security.CurrentTeacher;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/** Shared loading and aggregation used by {@link ExamService} and {@link ExamAnalysisService}. */
@Component
class ExamQueries {

    /** Newest exam first: exam date descending (undated last), then creation descending. */
    static final Comparator<Exam> LIST_ORDER = Comparator
            .comparing(Exam::getExamDate, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(Exam::getCreatedAt, Comparator.reverseOrder())
            .thenComparing(Exam::getId, Comparator.reverseOrder());

    private final ExamRepository examRepo;
    private final ExamQuestionRepository questionRepo;
    private final ExamResultRepository resultRepo;
    private final ExamAnswerRepository answerRepo;
    private final CurrentTeacher currentTeacher;

    ExamQueries(ExamRepository examRepo, ExamQuestionRepository questionRepo, ExamResultRepository resultRepo,
                ExamAnswerRepository answerRepo, CurrentTeacher currentTeacher) {
        this.examRepo = examRepo;
        this.questionRepo = questionRepo;
        this.resultRepo = resultRepo;
        this.answerRepo = answerRepo;
        this.currentTeacher = currentTeacher;
    }

    /** Loads an exam and checks that the current teacher owns its course. Call inside a transaction. */
    Exam requireExam(long id) {
        Exam exam = examRepo.findById(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
        currentTeacher.requireOwner(exam.getCourse().getOwnerId());
        return exam;
    }

    List<Exam> examsOfCourse(long courseId) {
        List<Exam> exams = new ArrayList<>(examRepo.findByCourse_Id(courseId));
        exams.sort(LIST_ORDER);
        return exams;
    }

    /** Questions, results and answers of the given exams in three queries. */
    Snapshot load(List<Exam> exams) {
        if (exams.isEmpty()) return new Snapshot(List.of(), Map.of(), Map.of(), Map.of());
        List<Long> ids = exams.stream().map(Exam::getId).toList();
        Map<Long, List<ExamQuestion>> questions = questionRepo.findByExamIds(ids).stream()
                .collect(Collectors.groupingBy(q -> q.getExam().getId(), LinkedHashMap::new, Collectors.toList()));
        Map<Long, List<ExamResult>> results = resultRepo.findByExamIds(ids).stream()
                .collect(Collectors.groupingBy(r -> r.getExam().getId(), LinkedHashMap::new, Collectors.toList()));
        Map<Long, List<ExamAnswer>> answers = answerRepo.findByExamIds(ids).stream()
                .collect(Collectors.groupingBy(a -> a.getResult().getId()));
        return new Snapshot(exams, questions, results, answers);
    }

    record Snapshot(List<Exam> exams, Map<Long, List<ExamQuestion>> questionsByExam,
                    Map<Long, List<ExamResult>> resultsByExam, Map<Long, List<ExamAnswer>> answersByResult) {

        List<ExamQuestion> questions(Exam exam) {
            return questionsByExam.getOrDefault(exam.getId(), List.of());
        }

        List<ExamResult> results(Exam exam) {
            return resultsByExam.getOrDefault(exam.getId(), List.of());
        }

        List<ExamAnswer> answers(ExamResult result) {
            return answersByResult.getOrDefault(result.getId(), List.of());
        }
    }

    static ExamSummaryDto summary(Exam exam, Snapshot data) {
        List<ExamQuestion> questions = data.questions(exam);
        List<ExamResult> results = data.results(exam);
        List<BigDecimal> totals = results.stream().map(r -> resultTotal(data.answers(r))).toList();
        return new ExamSummaryDto(exam.getId(), exam.getCourse().getId(), exam.getTitle(), exam.getExamDate(),
                questions.size(), examTotal(questions), results.size(), ExamMath.average(totals),
                exam.getCreatedAt().toString());
    }

    /** Sum of the questions' maxPoints. */
    static BigDecimal examTotal(Collection<ExamQuestion> questions) {
        return ExamMath.normalize(ExamMath.sum(questions.stream().map(ExamQuestion::getMaxPoints).toList()));
    }

    /** Sum of the graded answers' points. */
    static BigDecimal resultTotal(Collection<ExamAnswer> answers) {
        return ExamMath.normalize(ExamMath.sum(answers.stream().map(ExamAnswer::getPoints).toList()));
    }

    static int gradedCount(Collection<ExamAnswer> answers) {
        return (int) answers.stream().filter(a -> a.getPoints() != null).count();
    }
}
