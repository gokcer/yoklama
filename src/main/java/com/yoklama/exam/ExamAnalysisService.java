package com.yoklama.exam;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.course.CourseService;
import com.yoklama.course.RosterEntry;
import com.yoklama.course.RosterEntryRepository;
import com.yoklama.exam.ExamDtos.*;
import com.yoklama.exam.ExamMath.Tally;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Exam, course and student level success reports (11 §3.4). Everything is computed in memory. */
@Service
public class ExamAnalysisService {

    /** Ascending success rate, entries without a rate last, then by name. */
    private static <T> Comparator<T> byRate(Function<T, Double> rate, Function<T, String> name) {
        return Comparator.comparing(rate, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(name, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private final ExamQueries queries;
    private final CourseService courseService;
    private final RosterEntryRepository rosterRepo;

    public ExamAnalysisService(ExamQueries queries, CourseService courseService, RosterEntryRepository rosterRepo) {
        this.queries = queries;
        this.courseService = courseService;
        this.rosterRepo = rosterRepo;
    }

    // ---- exam ----------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ExamAnalysisDto exam(long examId) {
        Exam exam = queries.requireExam(examId);
        ExamQueries.Snapshot data = queries.load(List.of(exam));
        List<ExamQuestion> questions = data.questions(exam);
        List<ExamResult> results = data.results(exam);
        Map<Long, ExamQuestion> byId = questions.stream()
                .collect(Collectors.toMap(ExamQuestion::getId, Function.identity()));
        BigDecimal examTotal = ExamQueries.examTotal(questions);

        Map<Long, Tally> questionTally = new HashMap<>();
        Map<Long, Map<String, Integer>> choiceCounts = new HashMap<>();
        for (ExamQuestion q : questions) {
            questionTally.put(q.getId(), new Tally());
            if (q.getType() == QuestionType.CHOICE) {
                Map<String, Integer> counts = new LinkedHashMap<>();
                for (int i = 1; i <= q.getChoiceCount(); i++) counts.put(ExamMath.letter(i), 0);
                choiceCounts.put(q.getId(), counts);
            }
        }
        Map<String, Tally> topicTally = new HashMap<>();
        Map<String, Map<Long, Tally>> topicByStudent = new HashMap<>();
        List<BigDecimal> totals = new ArrayList<>();
        List<StudentAnalysisDto> students = new ArrayList<>();

        for (ExamResult r : results) {
            List<ExamAnswer> answers = data.answers(r);
            Map<String, Tally> studentTopics = new HashMap<>();
            for (ExamAnswer a : answers) {
                ExamQuestion q = byId.get(a.getQuestion().getId());
                if (q == null) continue;
                Map<String, Integer> counts = choiceCounts.get(q.getId());
                if (counts != null) counts.merge(a.getAnswerText() == null ? "" : a.getAnswerText(), 1, Integer::sum);
                if (a.getPoints() == null) continue;
                questionTally.get(q.getId()).add(a.getPoints(), q.getMaxPoints());
                if (q.getTopic() != null) {
                    topicTally.computeIfAbsent(q.getTopic(), t -> new Tally()).add(a.getPoints(), q.getMaxPoints());
                    studentTopics.computeIfAbsent(q.getTopic(), t -> new Tally()).add(a.getPoints(), q.getMaxPoints());
                }
            }
            studentTopics.forEach((topic, t) ->
                    topicByStudent.computeIfAbsent(topic, x -> new HashMap<>()).put(r.getId(), t));
            BigDecimal total = ExamQueries.resultTotal(answers);
            totals.add(total);
            students.add(new StudentAnalysisDto(r.getStudentNo(), r.getFullName(), total,
                    ExamMath.rate(total, examTotal), ExamQueries.gradedCount(answers) == questions.size(),
                    weakTopics(studentTopics)));
        }

        List<QuestionAnalysisDto> questionDtos = new ArrayList<>();
        for (ExamQuestion q : questions) {
            Tally t = questionTally.get(q.getId());
            Map<String, Integer> counts = choiceCounts.get(q.getId());
            if (counts != null) {
                // Blanks always present and last, after any out-of-range letters kept by a choiceCount shrink.
                Integer blanks = counts.remove("");
                counts.put("", blanks == null ? 0 : blanks);
            }
            questionDtos.add(new QuestionAnalysisDto(q.getId(), q.getPosition(), q.getType(), q.getTopic(),
                    ExamMath.normalize(q.getMaxPoints()), t.count(), ExamMath.mean(t.earned(), t.count()),
                    t.rate(), counts));
        }

        Map<String, List<ExamQuestion>> questionsByTopic = questions.stream().filter(q -> q.getTopic() != null)
                .collect(Collectors.groupingBy(ExamQuestion::getTopic, LinkedHashMap::new, Collectors.toList()));
        List<TopicAnalysisDto> topics = new ArrayList<>();
        questionsByTopic.forEach((topic, qs) -> {
            Tally t = topicTally.get(topic);
            int weak = (int) topicByStudent.getOrDefault(topic, Map.of()).values().stream()
                    .filter(st -> ExamMath.isWeak(st.rate())).count();
            topics.add(new TopicAnalysisDto(topic, qs.size(), ExamQueries.examTotal(qs),
                    t == null ? null : t.rate(), weak));
        });
        topics.sort(byRate(TopicAnalysisDto::successRate, TopicAnalysisDto::topic));

        return new ExamAnalysisDto(exam.getId(), examTotal, results.size(), ExamMath.average(totals),
                ExamMath.median(totals), ExamMath.min(totals), ExamMath.max(totals), questionDtos, topics, students);
    }

    /** Topics whose rate is below the weak threshold, weakest first. */
    private static List<String> weakTopics(Map<String, Tally> byTopic) {
        return byTopic.entrySet().stream()
                .filter(e -> ExamMath.isWeak(e.getValue().rate()))
                .sorted(byRate((Map.Entry<String, Tally> e) -> e.getValue().rate(), Map.Entry::getKey))
                .map(Map.Entry::getKey)
                .toList();
    }

    // ---- course --------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CourseLearningDto course(long courseId) {
        courseService.get(courseId);
        List<Exam> exams = queries.examsOfCourse(courseId);
        ExamQueries.Snapshot data = queries.load(exams);
        Map<String, String> names = names(courseId, data);

        Map<String, Integer> topicQuestionCount = new HashMap<>();
        Map<String, Tally> topicTally = new HashMap<>();
        Map<String, Map<String, Tally>> topicByStudent = new HashMap<>();
        Map<String, Tally> studentTally = new HashMap<>();
        Map<String, Integer> examCount = new HashMap<>();

        for (Exam exam : exams) {
            Map<Long, ExamQuestion> byId = new HashMap<>();
            for (ExamQuestion q : data.questions(exam)) {
                byId.put(q.getId(), q);
                if (q.getTopic() != null) topicQuestionCount.merge(q.getTopic(), 1, Integer::sum);
            }
            for (ExamResult r : data.results(exam)) {
                String no = r.getStudentNo();
                examCount.merge(no, 1, Integer::sum);
                Tally st = studentTally.computeIfAbsent(no, x -> new Tally());
                for (ExamAnswer a : data.answers(r)) {
                    ExamQuestion q = byId.get(a.getQuestion().getId());
                    if (q == null || a.getPoints() == null) continue;
                    st.add(a.getPoints(), q.getMaxPoints());
                    if (q.getTopic() != null) {
                        topicTally.computeIfAbsent(q.getTopic(), x -> new Tally()).add(a.getPoints(), q.getMaxPoints());
                        topicByStudent.computeIfAbsent(q.getTopic(), x -> new HashMap<>())
                                .computeIfAbsent(no, x -> new Tally()).add(a.getPoints(), q.getMaxPoints());
                    }
                }
            }
        }

        List<CourseTopicDto> topics = new ArrayList<>();
        topicQuestionCount.forEach((topic, count) -> {
            List<WeakStudentDto> weak = topicByStudent.getOrDefault(topic, Map.of()).entrySet().stream()
                    .filter(e -> ExamMath.isWeak(e.getValue().rate()))
                    .map(e -> new WeakStudentDto(e.getKey(), names.getOrDefault(e.getKey(), ""), e.getValue().rate()))
                    .sorted(byRate(WeakStudentDto::successRate, WeakStudentDto::studentNo))
                    .toList();
            Tally t = topicTally.get(topic);
            topics.add(new CourseTopicDto(topic, count, t == null ? null : t.rate(), weak));
        });
        topics.sort(byRate(CourseTopicDto::successRate, CourseTopicDto::topic));

        List<CourseStudentDto> students = new ArrayList<>();
        for (Map.Entry<String, String> e : names.entrySet()) {
            String no = e.getKey();
            Map<String, Tally> perTopic = new HashMap<>();
            topicByStudent.forEach((topic, byStudent) -> {
                Tally t = byStudent.get(no);
                if (t != null) perTopic.put(topic, t);
            });
            Tally t = studentTally.get(no);
            students.add(new CourseStudentDto(no, e.getValue(), examCount.getOrDefault(no, 0),
                    t == null ? null : t.rate(), weakTopics(perTopic)));
        }
        students.sort(byRate(CourseStudentDto::percent, CourseStudentDto::studentNo));

        List<ExamSummaryDto> summaries = exams.stream().map(ex -> ExamQueries.summary(ex, data)).toList();
        return new CourseLearningDto(courseId, summaries, topics, students);
    }

    /** Roster students and everyone with a result: roster name, else the name on the latest result. */
    private Map<String, String> names(long courseId, ExamQueries.Snapshot data) {
        Map<String, ExamResult> latest = new HashMap<>();
        for (List<ExamResult> rs : data.resultsByExam().values()) {
            for (ExamResult r : rs) {
                latest.merge(r.getStudentNo(), r, (a, b) -> b.getUpdatedAt().isAfter(a.getUpdatedAt()) ? b : a);
            }
        }
        Map<String, String> names = new TreeMap<>();
        latest.forEach((no, r) -> names.put(no, r.getFullName()));
        for (RosterEntry e : rosterRepo.findByCourseIdOrderByStudentNoAsc(courseId)) {
            names.put(e.getStudentNo(), e.getFullName());
        }
        return names;
    }

    // ---- student -------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public StudentLearningDto student(long courseId, String rawStudentNo) {
        courseService.get(courseId);
        String studentNo = rawStudentNo == null ? "" : rawStudentNo.trim();
        List<Exam> exams = queries.examsOfCourse(courseId);
        ExamQueries.Snapshot data = queries.load(exams);
        Optional<RosterEntry> roster = rosterRepo.findByCourseIdAndStudentNo(courseId, studentNo);

        List<StudentExamDto> examDtos = new ArrayList<>();
        Map<String, Tally> perTopic = new HashMap<>();
        List<MissedQuestionDto> missed = new ArrayList<>();
        ExamResult latest = null;

        for (Exam exam : exams) {
            ExamResult r = data.results(exam).stream()
                    .filter(x -> x.getStudentNo().equals(studentNo)).findFirst().orElse(null);
            if (r == null) continue;
            if (latest == null || r.getUpdatedAt().isAfter(latest.getUpdatedAt())) latest = r;
            List<ExamQuestion> questions = data.questions(exam);
            Map<Long, ExamAnswer> byQuestion = data.answers(r).stream()
                    .collect(Collectors.toMap(a -> a.getQuestion().getId(), Function.identity()));
            BigDecimal total = ExamQueries.resultTotal(byQuestion.values());
            BigDecimal max = ExamQueries.examTotal(questions);
            examDtos.add(new StudentExamDto(exam.getId(), exam.getTitle(), exam.getExamDate(), total, max,
                    ExamMath.rate(total, max), ExamQueries.gradedCount(byQuestion.values()) == questions.size()));
            for (ExamQuestion q : questions) {
                ExamAnswer a = byQuestion.get(q.getId());
                if (a == null || a.getPoints() == null) continue;
                if (q.getTopic() != null) {
                    perTopic.computeIfAbsent(q.getTopic(), x -> new Tally()).add(a.getPoints(), q.getMaxPoints());
                }
                if (a.getPoints().multiply(BigDecimal.TWO).compareTo(q.getMaxPoints()) < 0) {
                    missed.add(new MissedQuestionDto(exam.getId(), exam.getTitle(), q.getPosition(), q.getTopic(),
                            q.getText(), a.getAnswerText(),
                            q.getType() == QuestionType.CHOICE ? q.getCorrectChoice() : null,
                            ExamMath.normalize(a.getPoints()), ExamMath.normalize(q.getMaxPoints())));
                }
            }
        }
        if (roster.isEmpty() && latest == null) throw new ApiException(ErrorCode.NOT_FOUND);

        List<StudentTopicDto> topics = perTopic.entrySet().stream()
                .map(e -> new StudentTopicDto(e.getKey(), e.getValue().count(),
                        ExamMath.normalize(e.getValue().earned()), ExamMath.normalize(e.getValue().max()),
                        e.getValue().rate()))
                .sorted(byRate(StudentTopicDto::successRate, StudentTopicDto::topic))
                .toList();
        String fullName = roster.map(RosterEntry::getFullName).orElse(latest != null ? latest.getFullName() : "");
        return new StudentLearningDto(courseId, studentNo, fullName, examDtos, topics, missed);
    }
}
