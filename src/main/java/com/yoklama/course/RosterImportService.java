package com.yoklama.course;

import com.yoklama.common.ApiException;
import com.yoklama.common.ErrorCode;
import com.yoklama.config.AppProperties;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class RosterImportService {

    static final int MAX_NAME = 200;

    private final RosterEntryRepository rosterRepo;
    private final Pattern studentNoPattern;

    public RosterImportService(RosterEntryRepository rosterRepo, AppProperties props) {
        this.rosterRepo = rosterRepo;
        this.studentNoPattern = Pattern.compile(props.checkin().studentNoPattern());
    }

    public enum Mode { REPLACE, MERGE }

    public record ImportResult(int imported, int skipped, List<ImportError> errors) {}
    public record ImportError(int line, String message) {}

    record Row(int line, String studentNo, String fullName) {}
    record Parsed(List<Row> rows, int skipped, List<ImportError> errors) {}

    @Transactional
    public ImportResult importCsv(Course course, InputStream input, String modeParam) {
        Mode mode;
        try {
            mode = Mode.valueOf(modeParam.trim().toUpperCase(Locale.ROOT));
        } catch (RuntimeException e) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, Map.of("mode", "REPLACE|MERGE"));
        }

        Parsed parsed;
        try {
            parsed = parse(input);
        } catch (IOException e) {
            return new ImportResult(0, 0, List.of(new ImportError(0, "Dosya okunamadı.")));
        }

        if (mode == Mode.REPLACE) {
            rosterRepo.deleteAllByCourseId(course.getId());
        }
        Map<String, RosterEntry> existing = mode == Mode.MERGE
                ? rosterRepo.findByCourseIdOrderByStudentNoAsc(course.getId()).stream()
                    .collect(Collectors.toMap(RosterEntry::getStudentNo, Function.identity()))
                : Map.of();

        int imported = 0;
        for (Row row : parsed.rows()) {
            RosterEntry e = existing.get(row.studentNo());
            if (e != null) {
                e.setFullName(row.fullName());
            } else {
                rosterRepo.save(new RosterEntry(course, row.studentNo(), row.fullName()));
            }
            imported++;
        }
        return new ImportResult(imported, parsed.skipped(), parsed.errors());
    }

    /** Parses the CSV (05 §9.7); a student number repeated in the file keeps its last row. */
    Parsed parse(InputStream input) throws IOException {
        List<ImportError> errors = new ArrayList<>();
        Map<String, Row> rows = new LinkedHashMap<>();
        int skipped = 0;

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stripBom(input), StandardCharsets.UTF_8))) {
            String line;
            int lineNo = 0;
            Character sep = null;
            while ((line = reader.readLine()) != null) {
                lineNo++;
                if (line.isBlank()) continue;
                if (sep == null) {
                    sep = detectSeparator(line);
                    String[] first = parseLine(line, sep);
                    if (isHeaderLine(first)) continue;
                }
                String[] fields = parseLine(line, sep);
                if (fields.length < 2) {
                    errors.add(new ImportError(lineNo, "En az 2 sütun gerekli."));
                    continue;
                }
                String studentNo = fields[0].trim();
                String fullName = fields[1].trim();
                if (!studentNoPattern.matcher(studentNo).matches()) {
                    errors.add(new ImportError(lineNo, "Geçersiz öğrenci numarası: " + clip(studentNo, 40)));
                    continue;
                }
                if (fullName.isEmpty()) {
                    errors.add(new ImportError(lineNo, "Ad boş olamaz."));
                    continue;
                }
                if (rows.put(studentNo, new Row(lineNo, studentNo, clip(fullName, MAX_NAME))) != null) {
                    skipped++;
                }
            }
        }
        return new Parsed(new ArrayList<>(rows.values()), skipped, errors);
    }

    private static boolean isHeaderLine(String[] fields) {
        if (fields.length < 2) return false;
        String first = fields[0].trim();
        return first.isEmpty() || !first.chars().allMatch(Character::isDigit);
    }

    private static char detectSeparator(String line) {
        long semiCount = line.chars().filter(c -> c == ';').count();
        long commaCount = line.chars().filter(c -> c == ',').count();
        return semiCount >= commaCount ? ';' : ',';
    }

    private static InputStream stripBom(InputStream in) throws IOException {
        PushbackInputStream pis = new PushbackInputStream(in, 3);
        byte[] bom = new byte[3];
        int read = pis.readNBytes(bom, 0, 3);
        boolean isBom = read == 3 && bom[0] == (byte) 0xEF && bom[1] == (byte) 0xBB && bom[2] == (byte) 0xBF;
        if (!isBom && read > 0) pis.unread(bom, 0, read);
        return pis;
    }

    private static String clip(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    static String[] parseLine(String line, char sep) {
        List<String> fields = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') {
                        sb.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    sb.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == sep) {
                fields.add(sb.toString());
                sb.setLength(0);
            } else {
                sb.append(c);
            }
        }
        fields.add(sb.toString());
        return fields.toArray(new String[0]);
    }
}
