package com.yoklama.checkin;

import com.yoklama.crypto.QrToken;
import com.yoklama.crypto.QrTokenCodec;
import com.yoklama.session.ClassSession;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** Implements the per-scan rules of 02 §7. Pure: no clock or database access. */
@Component
public class ScanValidator {

    public static final String TOKEN_INVALID = "TOKEN_INVALID";
    public static final String TOKEN_EXPIRED = "TOKEN_EXPIRED";

    public record ValidationResult(boolean valid, String reason, boolean clockSuspect,
                                   boolean duplicate, QrToken token) {
        static ValidationResult invalid(String reason, QrToken token) {
            return new ValidationResult(false, reason, false, false, token);
        }
    }

    /**
     * Check-in scan: token age is measured against the server arrival time.
     *
     * @param validSeqs seq values already accepted as valid in this attempt
     */
    public ValidationResult validate(String rawToken, long firstSeenServerMs, long arrivalMs,
                                     byte[] sessionKey, ClassSession session, Set<Integer> validSeqs) {
        return doValidate(rawToken, firstSeenServerMs, arrivalMs, arrivalMs, sessionKey, session, validSeqs);
    }

    /**
     * Calibration scans are uploaded as a batch after the run, so the age rule uses the frame time
     * ({@code firstSeenServerMs - ts <= maxTokenAgeMs}) instead of the arrival time (05 §9.3).
     */
    public ValidationResult validateCalibration(String rawToken, long firstSeenServerMs, long arrivalMs,
                                                byte[] sessionKey, ClassSession session, Set<Integer> validSeqs) {
        return doValidate(rawToken, firstSeenServerMs, arrivalMs, firstSeenServerMs, sessionKey, session, validSeqs);
    }

    private ValidationResult doValidate(String rawToken, long firstSeenServerMs, long arrivalMs, long ageReferenceMs,
                                        byte[] sessionKey, ClassSession session, Set<Integer> validSeqs) {
        Optional<QrToken> parsed = QrTokenCodec.parse(rawToken);
        if (parsed.isEmpty()) {
            return ValidationResult.invalid(TOKEN_INVALID, null);
        }
        QrToken token = parsed.get();

        if (!token.code().equals(session.getCode()) || session.getEpochStartMs() == null
                || session.getClosesAt() == null) {
            return ValidationResult.invalid(TOKEN_INVALID, token);
        }
        if (!QrTokenCodec.verify(sessionKey, token)) {
            return ValidationResult.invalid(TOKEN_INVALID, token);
        }
        long expectedTs = session.getEpochStartMs() + (long) token.seq() * session.getRefreshMs();
        if (token.ts() != expectedTs) {
            return ValidationResult.invalid(TOKEN_INVALID, token);
        }
        if (token.ts() < session.getEpochStartMs() || token.ts() >= session.getClosesAt().toEpochMilli()) {
            return ValidationResult.invalid(TOKEN_INVALID, token);
        }
        if (ageReferenceMs - token.ts() > session.getMaxTokenAgeMs()) {
            return ValidationResult.invalid(TOKEN_EXPIRED, token);
        }
        if (token.ts() > arrivalMs + 1000) {
            return ValidationResult.invalid(TOKEN_INVALID, token);
        }
        if (validSeqs.contains(token.seq())) {
            return new ValidationResult(true, null, false, true, token);
        }

        boolean clockSuspect = firstSeenServerMs > arrivalMs + 500
                || firstSeenServerMs - token.ts() < -150;
        return new ValidationResult(true, null, clockSuspect, false, token);
    }

    /** Valid, non-duplicate seq values of the given scans. */
    public static List<Integer> distinctValidSeqs(Collection<ScanRecord> scans) {
        return scans.stream()
                .filter(s -> s.isValid() && !s.isDuplicate() && s.getSeq() != null)
                .map(ScanRecord::getSeq)
                .distinct()
                .sorted()
                .toList();
    }

    public static boolean checkCompletionCondition(Collection<ScanRecord> scans, int requiredScans, int maxSpanSlots) {
        return isComplete(distinctValidSeqs(scans), requiredScans, maxSpanSlots);
    }

    /** 02 §7.1: some window of {@code maxSpanSlots} consecutive slots holds at least {@code requiredScans} seqs. */
    public static boolean isComplete(Collection<Integer> seqValues, int requiredScans, int maxSpanSlots) {
        List<Integer> seqs = seqValues.stream().distinct().sorted().toList();
        if (seqs.size() < requiredScans) return false;
        for (int i = 0; i <= seqs.size() - requiredScans; i++) {
            long windowEnd = (long) seqs.get(i) + maxSpanSlots - 1;
            if (seqs.get(i + requiredScans - 1) <= windowEnd) return true;
        }
        return false;
    }
}
