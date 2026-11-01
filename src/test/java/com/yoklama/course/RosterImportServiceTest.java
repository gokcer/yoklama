package com.yoklama.course;

import com.yoklama.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class RosterImportServiceTest {

    static RosterImportService service() {
        var checkin = new AppProperties.Checkin(null, 800, 150, true, 180, "^[0-9]{5,12}$", 60);
        var props = new AppProperties(null, null, null, null, null, null, null, null, null, checkin);
        return new RosterImportService(null, props);
    }

    static RosterImportService.Parsed parse(String csv, boolean bom) throws IOException {
        byte[] body = csv.getBytes(StandardCharsets.UTF_8);
        if (bom) {
            byte[] withBom = new byte[body.length + 3];
            withBom[0] = (byte) 0xEF; withBom[1] = (byte) 0xBB; withBom[2] = (byte) 0xBF;
            System.arraycopy(body, 0, withBom, 3, body.length);
            body = withBom;
        }
        return service().parse(new ByteArrayInputStream(body));
    }

    @Test
    void semicolonWithHeaderAndBom() throws IOException {
        var p = parse("ogrenciNo;adSoyad\r\n220201001;Ayşe Yılmaz\r\n220201002;Çağrı Öztürk\r\n", true);
        assertEquals(2, p.rows().size());
        assertEquals("220201001", p.rows().get(0).studentNo());
        assertEquals("Ayşe Yılmaz", p.rows().get(0).fullName());
        assertTrue(p.errors().isEmpty());
    }

    @Test
    void commaWithoutHeader() throws IOException {
        var p = parse("220201001,Ali Veli\n220201002,Can Demir\n", false);
        assertEquals(2, p.rows().size());
        assertEquals("Can Demir", p.rows().get(1).fullName());
    }

    @Test
    void quotedFields() throws IOException {
        var p = parse("studentNo;fullName\n220201001;\"Yılmaz; Ayşe \"\"Ayşo\"\"\"\n", false);
        assertEquals("Yılmaz; Ayşe \"Ayşo\"", p.rows().get(0).fullName());
    }

    @Test
    void errorsReportLineNumbers() throws IOException {
        var p = parse("studentNo;fullName\n12;Kısa No\n220201001\n220201002;\n220201003;Tamam\n", false);
        assertEquals(1, p.rows().size());
        assertEquals(3, p.errors().size());
        assertEquals(2, p.errors().get(0).line());
        assertEquals(3, p.errors().get(1).line());
        assertEquals(4, p.errors().get(2).line());
    }

    @Test
    void duplicateInFileIsSkipped() throws IOException {
        var p = parse("220201001;Eski\n220201001;Yeni\n", false);
        assertEquals(1, p.rows().size());
        assertEquals("Yeni", p.rows().get(0).fullName());
        assertEquals(1, p.skipped());
    }

    @Test
    void blankLinesIgnored() throws IOException {
        var p = parse("\n\n220201001;A\n\n", false);
        assertEquals(1, p.rows().size());
    }
}
