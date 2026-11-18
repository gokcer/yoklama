package com.yoklama.exam;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ExamMathTest {

    static BigDecimal d(String s) { return new BigDecimal(s); }

    @Test
    void choicePoints() {
        assertNull(ExamMath.choicePoints("A", null, d("4")));
        assertEquals(d("4"), ExamMath.choicePoints("B", "B", d("4")));
        assertEquals(BigDecimal.ZERO, ExamMath.choicePoints("C", "B", d("4")));
        assertEquals(BigDecimal.ZERO, ExamMath.choicePoints(null, "B", d("4")));
    }

    @Test
    void normalizeAvoidsExponent() {
        assertEquals("100", ExamMath.normalize(d("100.00")).toPlainString());
        assertEquals("100", ExamMath.normalize(d("100.00")).toString());
        assertEquals("2.5", ExamMath.normalize(d("2.50")).toString());
        assertEquals("0", ExamMath.normalize(d("0.00")).toString());
        assertNull(ExamMath.normalize(null));
    }

    @Test
    void columnScaleRoundsHalfUp() {
        assertEquals(d("0.13"), ExamMath.toColumnScale(d("0.125")));
        assertEquals(d("4.00"), ExamMath.toColumnScale(d("4")));
    }

    @Test
    void statistics() {
        List<BigDecimal> v = List.of(d("20"), d("10.5"), d("8"));
        assertEquals(d("12.83"), ExamMath.average(v));
        assertEquals(d("10.5"), ExamMath.median(v));
        assertEquals(d("8"), ExamMath.min(v));
        assertEquals(d("20"), ExamMath.max(v));
        assertEquals(d("15.25"), ExamMath.median(List.of(d("20"), d("10.5"), d("8"), d("30"))));
        assertNull(ExamMath.average(List.of()));
        assertNull(ExamMath.median(List.of()));
        assertNull(ExamMath.min(List.of()));
        assertNull(ExamMath.mean(BigDecimal.ZERO, 0));
    }

    @Test
    void rateAndWeakness() {
        assertNull(ExamMath.rate(d("1"), BigDecimal.ZERO));
        assertEquals(0.25, ExamMath.rate(d("1"), d("4")), 1e-12);
        assertTrue(ExamMath.isWeak(0.4999));
        assertFalse(ExamMath.isWeak(0.5));
        assertFalse(ExamMath.isWeak(null));

        ExamMath.Tally t = new ExamMath.Tally();
        assertNull(t.rate());
        t.add(d("3"), d("4"));
        t.add(d("0"), d("2"));
        assertEquals(2, t.count());
        assertEquals(0.5, t.rate(), 1e-12);
    }

    @Test
    void letters() {
        assertEquals("A", ExamMath.letter(1));
        assertEquals("F", ExamMath.letter(6));
    }

    @Test
    void csvDecimal() {
        assertEquals("", ExamService.decimal(null));
        assertEquals("10,5", ExamService.decimal(d("10.50")));
        assertEquals("4", ExamService.decimal(d("4.00")));
    }
}
