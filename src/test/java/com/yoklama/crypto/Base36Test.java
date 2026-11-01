package com.yoklama.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class Base36Test {

    @Test
    void encodeZero() {
        assertEquals("0", Base36.encode(0));
    }

    @Test
    void encodeSeven() {
        assertEquals("7", Base36.encode(7));
    }

    @Test
    void encode1295() {
        assertEquals("ZZ", Base36.encode(1295));
    }

    @Test
    void encodeTs() {
        assertEquals("MGJ6K3CW", Base36.encode(1760000000000L));
    }

    @Test
    void decodeRoundTrip() {
        assertEquals(1295, Base36.decode("ZZ"));
        assertEquals(1760000000000L, Base36.decode("MGJ6K3CW"));
    }

    @Test
    void decodeLowerCaseRejected() {
        assertThrows(IllegalArgumentException.class, () -> Base36.decode("zz"));
    }

    @Test
    void decodeInvalidCharRejected() {
        assertThrows(IllegalArgumentException.class, () -> Base36.decode("A!B"));
    }

    @Test
    void encodeNegativeRejected() {
        assertThrows(IllegalArgumentException.class, () -> Base36.encode(-1));
    }
}
