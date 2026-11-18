package com.yoklama.exam;

import com.yoklama.exam.ExamDtos.*;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api")
public class ExamController {

    private final ExamService service;
    private final ExamAnalysisService analysis;

    public ExamController(ExamService service, ExamAnalysisService analysis) {
        this.service = service;
        this.analysis = analysis;
    }

    @GetMapping("/courses/{courseId}/exams")
    public List<ExamSummaryDto> list(@PathVariable long courseId) {
        return service.list(courseId);
    }

    @PostMapping("/courses/{courseId}/exams")
    @ResponseStatus(HttpStatus.CREATED)
    public ExamDto create(@PathVariable long courseId, @RequestBody ExamRequest req) {
        return service.create(courseId, req);
    }

    @GetMapping("/exams/{id}")
    public ExamDto get(@PathVariable long id) {
        return service.get(id);
    }

    @PutMapping("/exams/{id}")
    public ExamDto update(@PathVariable long id, @RequestBody ExamRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/exams/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

    @GetMapping("/exams/{id}/results")
    public List<ExamResultDto> results(@PathVariable long id) {
        return service.results(id);
    }

    @PutMapping("/exams/{id}/results/{studentNo}")
    public ExamResultDto upsertResult(@PathVariable long id, @PathVariable String studentNo,
                                      @RequestBody ExamResultRequest req) {
        return service.upsertResult(id, studentNo, req);
    }

    @DeleteMapping("/exams/{id}/results/{studentNo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteResult(@PathVariable long id, @PathVariable String studentNo) {
        service.deleteResult(id, studentNo);
    }

    @GetMapping("/exams/{id}/analysis")
    public ExamAnalysisDto analysis(@PathVariable long id) {
        return analysis.exam(id);
    }

    @GetMapping("/exams/{id}/results.csv")
    public ResponseEntity<byte[]> resultsCsv(@PathVariable long id) {
        ExamService.CsvExport export = service.csv(id);
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(export.filename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(export.content().getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/courses/{courseId}/learning")
    public CourseLearningDto courseLearning(@PathVariable long courseId) {
        return analysis.course(courseId);
    }

    @GetMapping("/courses/{courseId}/learning/students/{studentNo}")
    public StudentLearningDto studentLearning(@PathVariable long courseId, @PathVariable String studentNo) {
        return analysis.student(courseId, studentNo);
    }
}
