package com.yoklama.checkin;

import com.yoklama.crypto.QrTokenCodec;
import com.yoklama.session.ClassSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ScanValidatorTest {

    static final byte[] KEY = new byte[32];
    static { for (int i = 0; i < 32; i++) KEY[i] = (byte) i; }
    static final long EPOCH = 1_760_000_000_000L;
    static final int REFRESH = 1000;

    final ScanValidator validator = new ScanValidator();
    ClassSession session;

    @BeforeEach
    void setUp() {
        session = new ClassSession(null, "t", "ABC234", Instant.EPOCH);
        session.setEpochStartMs(EPOCH);
        session.setRefreshMs(REFRESH);
        session.setMaxTokenAgeMs(4000);
        session.setClosesAt(Instant.ofEpochMilli(EPOCH + 600_000));
    }

    String token(int seq) { return QrTokenCodec.sign(KEY, "ABC234", seq, EPOCH + (long) seq * REFRESH); }
    long ts(int seq) { return EPOCH + (long) seq * REFRESH; }

    ScanValidator.ValidationResult check(String token, long firstSeen, long arrival) {
        return validator.validate(token, firstSeen, arrival, KEY, session, Set.of());
    }

    @Test
    void validScan() {
        var r = check(token(7), ts(7) + 180, ts(7) + 400);
        assertTrue(r.valid());
        assertNull(r.reason());
        assertFalse(r.clockSuspect());
        assertEquals(7, r.token().seq());
    }

    @Test
    void formatInvalid() {
        assertEquals("TOKEN_INVALID", check("garbage", 0, ts(1)).reason());
        assertEquals("TOKEN_INVALID", check(null, 0, ts(1)).reason());
    }

    @Test
    void otherSessionCode() {
        String other = QrTokenCodec.sign(KEY, "K7Q2ZP", 7, ts(7));
        assertEquals("TOKEN_INVALID", check(other, ts(7) + 100, ts(7) + 200).reason());
    }

    @Test
    void badSignature() {
        String t = token(7);
        String tampered = t.substring(0, t.length() - 1) + (t.endsWith("A") ? "B" : "A");
        assertEquals("TOKEN_INVALID", check(tampered, ts(7) + 100, ts(7) + 200).reason());
    }

    @Test
    void tsNotOnSlotGrid() {
        String t = QrTokenCodec.sign(KEY, "ABC234", 7, ts(7) + 1);
        assertEquals("TOKEN_INVALID", check(t, ts(7) + 100, ts(7) + 200).reason());
    }

    @Test
    void tsAtOrAfterClose() {
        session.setClosesAt(Instant.ofEpochMilli(ts(7)));
        assertEquals("TOKEN_INVALID", check(token(7), ts(7) + 100, ts(7) + 200).reason());
    }

    @Test
    void tooOld() {
        assertEquals("TOKEN_EXPIRED", check(token(7), ts(7) + 100, ts(7) + 4001).reason());
        assertTrue(check(token(7), ts(7) + 100, ts(7) + 4000).valid());
    }

    @Test
    void fromTheFuture() {
        assertEquals("TOKEN_INVALID", check(token(7), ts(7), ts(7) - 1001).reason());
        assertTrue(check(token(7), ts(7), ts(7) - 1000).valid());
    }

    @Test
    void firstSeenAfterArrivalIsClockSuspect() {
        var r = check(token(7), ts(7) + 1000, ts(7) + 400);
        assertTrue(r.valid());
        assertTrue(r.clockSuspect());
    }

    @Test
    void firstSeenBeforeTsIsClockSuspect() {
        assertTrue(check(token(7), ts(7) - 151, ts(7) + 400).clockSuspect());
        assertFalse(check(token(7), ts(7) - 150, ts(7) + 400).clockSuspect());
    }

    @Test
    void duplicateSeq() {
        var r = validator.validate(token(7), ts(7) + 100, ts(7) + 300, KEY, session, Set.of(7));
        assertTrue(r.valid());
        assertTrue(r.duplicate());
    }

    @Test
    void calibrationAgeUsesFirstSeen() {
        long arrival = ts(7) + 9000;   // uploaded as a batch, long after the frame
        assertEquals("TOKEN_EXPIRED", check(token(7), ts(7) + 200, arrival).reason());
        assertTrue(validator.validateCalibration(token(7), ts(7) + 200, arrival, KEY, session, Set.of()).valid());
        assertEquals("TOKEN_EXPIRED",
                validator.validateCalibration(token(7), ts(7) + 4001, arrival, KEY, session, Set.of()).reason());
    }

    @Test
    void completionCondition() {
        assertTrue(ScanValidator.isComplete(List.of(1, 2, 3), 3, 6));
        assertTrue(ScanValidator.isComplete(List.of(1, 3, 6), 3, 6));
        assertFalse(ScanValidator.isComplete(List.of(1, 4, 7), 3, 6));
        assertFalse(ScanValidator.isComplete(List.of(5, 5, 5), 3, 6));
        assertFalse(ScanValidator.isComplete(List.of(1, 2), 3, 6));
        assertTrue(ScanValidator.isComplete(List.of(1, 10, 11, 12), 3, 6));
    }
}
