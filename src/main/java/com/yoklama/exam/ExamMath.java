package com.yoklama.exam;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Pure scoring and statistics helpers for exams (11 §3.3, §3.4). */
public final class ExamMath {

    /** A success rate below this value marks a topic as weak. */
    public static final double WEAK_THRESHOLD = 0.5;

    private ExamMath() {}

    /** Rounds to the column scale of {@code numeric(7,2)}. */
    public static BigDecimal toColumnScale(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }

    /** Drops trailing zeros for JSON output without switching to exponent notation (100.00 → 100). */
    public static BigDecimal normalize(BigDecimal v) {
        if (v == null) return null;
        BigDecimal s = v.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }

    /** CHOICE scoring: no key → null; correct → maxPoints; wrong, blank or out of range → 0. */
    public static BigDecimal choicePoints(String answer, String correctChoice, BigDecimal maxPoints) {
        if (correctChoice == null) return null;
        return correctChoice.equals(answer) ? maxPoints : BigDecimal.ZERO;
    }

    /** Letter of the n-th choice (1-based): 1 → "A". */
    public static String letter(int n) {
        return String.valueOf((char) ('A' + n - 1));
    }

    /** earned / max as a double; null when max is zero or missing. */
    public static Double rate(BigDecimal earned, BigDecimal max) {
        if (earned == null || max == null || max.signum() == 0) return null;
        return earned.divide(max, MathContext.DECIMAL64).doubleValue();
    }

    public static boolean isWeak(Double rate) {
        return rate != null && rate < WEAK_THRESHOLD;
    }

    public static BigDecimal sum(Collection<BigDecimal> values) {
        BigDecimal s = BigDecimal.ZERO;
        for (BigDecimal v : values) if (v != null) s = s.add(v);
        return s;
    }

    /** Arithmetic mean rounded to two decimals; null for an empty input. */
    public static BigDecimal average(Collection<BigDecimal> values) {
        return mean(sum(values), values.size());
    }

    /** sum / count rounded to two decimals; null when count is zero. */
    public static BigDecimal mean(BigDecimal sum, int count) {
        if (count == 0) return null;
        return normalize(sum.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
    }

    /** Median (mean of the two middle values for an even count) rounded to two decimals; null if empty. */
    public static BigDecimal median(Collection<BigDecimal> values) {
        if (values.isEmpty()) return null;
        List<BigDecimal> sorted = new ArrayList<>(values);
        sorted.sort(null);
        int n = sorted.size();
        BigDecimal m = n % 2 == 1
                ? sorted.get(n / 2)
                : sorted.get(n / 2 - 1).add(sorted.get(n / 2)).divide(BigDecimal.TWO, 2, RoundingMode.HALF_UP);
        return normalize(m);
    }

    public static BigDecimal min(Collection<BigDecimal> values) {
        return values.stream().min(BigDecimal::compareTo).map(ExamMath::normalize).orElse(null);
    }

    public static BigDecimal max(Collection<BigDecimal> values) {
        return values.stream().max(BigDecimal::compareTo).map(ExamMath::normalize).orElse(null);
    }

    /** Running total of earned points over graded answers and their maxPoints. */
    public static final class Tally {
        private BigDecimal earned = BigDecimal.ZERO;
        private BigDecimal max = BigDecimal.ZERO;
        private int count;

        public void add(BigDecimal points, BigDecimal maxPoints) {
            earned = earned.add(points);
            max = max.add(maxPoints);
            count++;
        }

        public BigDecimal earned() { return earned; }
        public BigDecimal max() { return max; }
        public int count() { return count; }
        public Double rate() { return ExamMath.rate(earned, max); }
    }
}
