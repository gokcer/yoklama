package com.yoklama.export;

import com.yoklama.attendance.Attendance;
import com.yoklama.attendance.AttendanceSource;
import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.TeacherDecision;
import com.yoklama.course.RosterEntry;
import com.yoklama.decision.Flag;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CsvExportServiceTest {

    final CsvExportService service = new CsvExportService(null, null, null);

    @Test
    void escapesFormulaInjection() {
        assertEquals("\"'=HYPERLINK(1)\"", CsvExportService.esc("=HYPERLINK(1)"));
        assertEquals("\"'+1\"", CsvExportService.esc("+1"));
        assertEquals("\"'-1\"", CsvExportService.esc("-1"));
        assertEquals("\"'@SUM\"", CsvExportService.esc("@SUM"));
        assertEquals("\"a;b\"", CsvExportService.esc("a;b"));
        assertEquals("\"a\"\"b\"", CsvExportService.esc("a\"b"));
        assertEquals("düz", CsvExportService.esc("düz"));
    }

    @Test
    void rendersBomTurkishAndAbsentees() {
        Attendance a = new Attendance(null, "220201001", AttendanceSource.CHECKIN, AttendanceStatus.FLAGGED,
                Instant.parse("2026-10-20T09:01:12Z"));
        a.setFullName("Ayşe Yılmaz");
        a.setFlags(EnumSet.of(Flag.SCREEN_SUSPECT, Flag.LATENCY_HIGH));
        a.setMinLatencyMs(512);
        a.setLatencyThresholdMs(330);
        a.setTeacherDecision(TeacherDecision.NONE);

        String csv = service.render(List.of(a), List.of(
                new RosterEntry(null, "220201001", "Ayşe Yılmaz"),
                new RosterEntry(null, "220201002", "Çağlar Şişli")));

        assertTrue(csv.startsWith("﻿ogrenciNo;adSoyad;durum;katildi;bayraklar;gecikmeMs;esikMs;kaynak;zaman;not\r\n"));
        String[] lines = csv.substring(1).split("\r\n");
        assertEquals(3, lines.length);
        assertTrue(lines[1].startsWith("220201001;Ayşe Yılmaz;INCELEME_BEKLIYOR;HAYIR;LATENCY_HIGH,SCREEN_SUSPECT;512;330;CHECKIN;"));
        assertEquals("220201002;Çağlar Şişli;GELMEDI;HAYIR;;;;;;", lines[2]);
        assertEquals(9, lines[2].chars().filter(c -> c == ';').count());
    }
}
