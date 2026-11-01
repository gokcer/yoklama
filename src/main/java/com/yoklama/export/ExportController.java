package com.yoklama.export;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/sessions/{sessionId}")
public class ExportController {

    private final CsvExportService csvService;

    public ExportController(CsvExportService csvService) {
        this.csvService = csvService;
    }

    @GetMapping("/export.csv")
    public ResponseEntity<byte[]> exportCsv(@PathVariable long sessionId) {
        CsvExportService.Export export = csvService.export(sessionId);
        // RFC 6266/5987: non-ASCII course codes go into filename*.
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(export.filename(), StandardCharsets.UTF_8)
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(export.content().getBytes(StandardCharsets.UTF_8));
    }
}
