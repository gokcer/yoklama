package com.yoklama.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class QrTokenCodec {

    public static final Pattern FORMAT = Pattern.compile(
            "^Y1\\.([A-HJ-NP-Z2-9]{6})\\.([0-9A-Z]{1,4})\\.([0-9A-Z]{1,9})\\.([A-Z2-7]{13})$");

    private QrTokenCodec() {}

    public static String prefix(String code, int seq, long ts) {
        return "Y1." + code + "." + Base36.encode(seq) + "." + Base36.encode(ts);
    }

    public static String sign(byte[] key, String code, int seq, long ts) {
        String p = prefix(code, seq, ts);
        byte[] mac = Hmac.sha256(key, p.getBytes(StandardCharsets.US_ASCII));
        return p + "." + Base32.encode(Arrays.copyOf(mac, 8));
    }

    public static Optional<QrToken> parse(String raw) {
        if (raw == null) return Optional.empty();
        Matcher m = FORMAT.matcher(raw);
        if (!m.matches()) return Optional.empty();
        long seq = Base36.decode(m.group(2));
        long ts = Base36.decode(m.group(3));
        if (seq > Integer.MAX_VALUE) return Optional.empty();
        return Optional.of(new QrToken(m.group(1), (int) seq, ts, raw));
    }

    public static boolean verify(byte[] key, QrToken t) {
        String expected = sign(key, t.code(), t.seq(), t.ts());
        return MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.US_ASCII),
                t.raw().getBytes(StandardCharsets.US_ASCII));
    }
}
