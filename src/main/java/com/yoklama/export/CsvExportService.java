package com.yoklama.export;

import com.yoklama.attendance.Attendance;
import com.yoklama.attendance.AttendanceRepository;
import com.yoklama.attendance.AttendanceStatus;
import com.yoklama.attendance.TeacherDecision;
import com.yoklama.course.RosterEntry;
import com.yoklama.course.RosterEntryRepository;
import com.yoklama.decision.Flag;
import com.yoklama.session.ClassSession;
import com.yoklama.session.SessionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class CsvExportService {

    static final String BOM = "﻿";
    static final String SEP = ";";
    static final String NL = "\r\n";
    static final String HEADER = String.join(SEP,
            "ogrenciNo", "adSoyad", "durum", "katildi", "bayraklar", "gecikmeMs", "esikMs", "kaynak", "zaman", "not");

    private final AttendanceRepository attRepo;
    private final RosterEntryRepository rosterRepo;
    private final SessionService sessionService;
    private final DateTimeFormatter timeFormat;

    public CsvExportService(AttendanceRepository attRepo, RosterEntryRepository rosterRepo,
                            SessionService sessionService) {
        this.attRepo = attRepo;
        this.rosterRepo = rosterRepo;
        this.sessionService = sessionService;
        this.timeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());
    }

    public record Export(String filename, String content) {}

    @Transactional(readOnly = true)
    public Export export(long sessionId) {
        ClassSession session = sessionService.get(sessionId);
        List<Attendance> attendances = new ArrayList<>(attRepo.findBySession_IdOrderByCreatedAtDesc(sessionId));
        attendances.sort(Comparator.comparing(Attendance::getStudentNo));
        List<RosterEntry> roster = rosterRepo.findByCourseIdOrderByStudentNoAsc(session.getCourse().getId());
        return new Export(filename(session), render(attendances, roster));
    }

    String render(List<Attendance> attendances, List<RosterEntry> roster) {
        Set<String> checkedIn = attendances.stream().map(Attendance::getStudentNo).collect(Collectors.toSet());
        StringBuilder sb = new StringBuilder(BOM).append(HEADER).append(NL);
        for (Attendance a : attendances) {
            row(sb, a.getStudentNo(),
                    a.getFullName(),
                    statusLabel(a),
                    a.isPresent() ? "EVET" : "HAYIR",
                    a.getFlags().stream().sorted().map(Flag::name).collect(Collectors.joining(",")),
                    a.getMinLatencyMs() != null ? a.getMinLatencyMs().toString() : "",
                    a.getLatencyThresholdMs() != null ? a.getLatencyThresholdMs().toString() : "",
                    a.getSource().name(),
                    timeFormat.format(a.getCreatedAt()),
                    a.getTeacherNote());
        }
        // Students on the roster who did not attend (04 §4.6: "Roster varsa").
        for (RosterEntry r : roster) {
            if (!checkedIn.contains(r.getStudentNo())) {
                row(sb, r.getStudentNo(), r.getFullName(), "GELMEDI", "HAYIR", "", "", "", "", "", "");
            }
        }
        return sb.toString();
    }

    private void row(StringBuilder sb, String... cells) {
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(SEP);
            sb.append(esc(cells[i]));
        }
        sb.append(NL);
    }

    String filename(ClassSession s) {
        var at = s.getOpenedAt() != null ? s.getOpenedAt() : s.getCreatedAt();
        return "yoklama_" + s.getCourse().getCode() + "_"
                + DateTimeFormatter.ofPattern("yyyyMMdd-HHmm").withZone(ZoneId.systemDefault()).format(at)
                + ".csv";
    }

    private static String statusLabel(Attendance a) {
        if (a.getTeacherDecision() == TeacherDecision.APPROVED) return "ONAYLANDI";
        if (a.getTeacherDecision() == TeacherDecision.REJECTED) return "REDDEDILDI";
        if (a.getStatus() == AttendanceStatus.ACCEPTED) return "KABUL";
        return "INCELEME_BEKLIYOR";
    }

    /** Quotes when needed and neutralises spreadsheet formulas (=, +, -, @, tab, CR at the start). */
    static String esc(String val) {
        if (val == null || val.isEmpty()) return "";
        boolean needsQuote = val.contains(SEP) || val.contains("\"") || val.contains("\n") || val.contains("\r");
        if ("=+-@\t\r".indexOf(val.charAt(0)) >= 0) {
            val = "'" + val;
            needsQuote = true;
        }
        if (needsQuote) return "\"" + val.replace("\"", "\"\"") + "\"";
        return val;
    }
}
