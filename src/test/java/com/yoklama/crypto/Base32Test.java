package com.yoklama.crypto;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class Base32Test {

    @Test
    void vector_02_1_2() {
        byte[] input = {0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77};
        assertEquals("AAISEM2EKVTHO", Base32.encode(input));
    }

    @Test
    void emptyArray() {
        assertEquals("", Base32.encode(new byte[0]));
    }

    @Test
    void singleByte() {
        assertEquals("AA", Base32.encode(new byte[]{0x00}));
    }
}
