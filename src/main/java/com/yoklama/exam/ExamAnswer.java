package com.yoklama.exam;

import jakarta.persistence.*;

import java.math.BigDecimal;

@Entity
@Table(name = "exam_answer")
public class ExamAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "result_id", nullable = false)
    private ExamResult result;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "question_id", nullable = false)
    private ExamQuestion question;

    @Column(name = "answer_text", length = 2000)
    private String answerText;

    @Column(precision = 7, scale = 2)
    private BigDecimal points;

    protected ExamAnswer() {}

    public ExamAnswer(ExamResult result, ExamQuestion question) {
        this.result = result;
        this.question = question;
    }

    public Long getId() { return id; }
    public ExamResult getResult() { return result; }
    public ExamQuestion getQuestion() { return question; }
    public String getAnswerText() { return answerText; }
    public void setAnswerText(String answerText) { this.answerText = answerText; }
    public BigDecimal getPoints() { return points; }
    public void setPoints(BigDecimal points) { this.points = points; }
}
