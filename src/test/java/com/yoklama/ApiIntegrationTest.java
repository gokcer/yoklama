package com.yoklama;

import com.yoklama.crypto.Base32;
import com.yoklama.crypto.BleChallenge;
import com.yoklama.live.SseHub;
import com.yoklama.security.RateLimitFilter;
import com.yoklama.support.MutableClock;
import com.yoklama.support.TestClockConfig;
import com.yoklama.support.TestTokens;
import com.yoklama.teacher.TeacherRole;
import com.yoklama.teacher.TeacherUser;
import com.yoklama.teacher.TeacherUserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** End-to-end API scenarios of 10 §2. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestClockConfig.class)
class ApiIntegrationTest {

    static final AtomicInteger COUNTER = new AtomicInteger(10_000);
    static final SecureRandom RANDOM = new SecureRandom();
    static final double[][] SMALL_QR = {{400, 200}, {460, 200}, {460, 260}, {400, 260}};   // ratio ≈ 0.007
    static final double[][] BIG_QR = {{100, 50}, {800, 50}, {800, 500}, {100, 500}};      // ratio ≈ 0.61

    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @Autowired MutableClock clock;
    @Autowired TeacherUserRepository teachers;
    @Autowired PasswordEncoder encoder;
    @Autowired RateLimitFilter rateLimit;
    @MockitoSpyBean SseHub sseHub;

    @BeforeEach
    void setUp() {
        for (String name : List.of("t1", "t2")) {
            if (!teachers.existsByUsername(name)) {
                teachers.save(new TeacherUser(name, encoder.encode("parola123"), "Öğretmen " + name, TeacherRole.TEACHER));
            }
        }
        rateLimit.clear();
    }

    // ---- helpers ------------------------------------------------------------------------------

    static RequestPostProcessor t1() { return user("t1").roles("TEACHER"); }
    static RequestPostProcessor t2() { return user("t2").roles("TEACHER"); }

    static String studentNo() { return "2202" + COUNTER.incrementAndGet(); }

    static Cookie newDevice() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return new Cookie("YD", Base32.encode(b));
    }

    String toJson(Object o) { return json.writeValueAsString(o); }

    JsonNode body(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    long createCourse(RequestPostProcessor who) throws Exception {
        String code = "C" + COUNTER.incrementAndGet();
        return body(mvc.perform(post("/api/courses").with(who).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of("code", code, "name", "Bilgisayar Mühendisliğine Giriş"))))
                .andExpect(status().isCreated())).get("id").asLong();
    }

    void addRoster(long courseId, String no, String name) throws Exception {
        mvc.perform(post("/api/courses/" + courseId + "/roster").with(t1()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of("studentNo", no, "fullName", name))))
                .andExpect(status().isCreated());
    }

    /** Creates and opens a session; returns its detail JSON. */
    JsonNode openSession(long courseId, Map<String, Object> extra) throws Exception {
        Map<String, Object> req = new HashMap<>(Map.of("courseId", courseId, "title", "Hafta 5",
                "requireRoster", false, "frameCapture", false));
        req.putAll(extra);
        long id = body(mvc.perform(post("/api/sessions").with(t1()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(toJson(req)))
                .andExpect(status().isCreated())).get("id").asLong();
        return body(mvc.perform(post("/api/sessions/" + id + "/open").with(t1()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN")));
    }

    JsonNode openSession(long courseId) throws Exception {
        return openSession(courseId, Map.of());
    }

    record S(long id, String code, long epoch, int refresh) {
        static S of(JsonNode n) {
            return new S(n.get("id").asLong(), n.get("code").asString(), n.get("epochStartMs").asLong(),
                    n.get("refreshMs").asInt());
        }
        long ts(int seq) { return TestTokens.ts(epoch, refresh, seq); }
        String token(int seq) { return TestTokens.forSession(id, code, epoch, refresh, seq); }
    }

    ResultActions start(Cookie yd, String code, String no) throws Exception {
        return mvc.perform(post("/api/public/checkins").cookie(yd)
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of("sessionCode", code.toLowerCase(), "studentNo", no,
                        "client", Map.of("userAgent", "JUnit", "platform", "test")))));
    }

    String startOk(Cookie yd, S s, String no) throws Exception {
        clock.setMillis(Math.max(clock.millis(), s.epoch()));
        String attemptId = body(start(yd, s.code(), no).andExpect(status().isCreated())).get("attemptId").asString();
        mvc.perform(post("/api/public/checkins/" + attemptId + "/sync").cookie(yd)
                .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("offsetMs", -38, "rttMs", 92))))
                .andExpect(status().isNoContent());
        return attemptId;
    }

    ResultActions scan(Cookie yd, String attemptId, String token, long firstSeen, double[][] corners) throws Exception {
        Map<String, Object> req = new HashMap<>(Map.of("token", token, "firstSeenServerMs", firstSeen,
                "frameTimeSource", "captureTime", "frameW", 960, "frameH", 540));
        if (corners != null) req.put("corners", corners);
        return mvc.perform(post("/api/public/checkins/" + attemptId + "/scans").cookie(yd)
                .contentType(MediaType.APPLICATION_JSON).content(toJson(req)));
    }

    /** Scans the given slots with a fixed optical latency; each arrives 60 ms after the frame. */
    void scanSlots(Cookie yd, String attemptId, S s, long latency, double[][] corners, int... seqs) throws Exception {
        for (int seq : seqs) {
            long firstSeen = s.ts(seq) + latency;
            clock.setMillis(Math.max(clock.millis(), firstSeen + 60));
            scan(yd, attemptId, s.token(seq), firstSeen, corners)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.valid").value(true));
        }
    }

    ResultActions complete(Cookie yd, String attemptId) throws Exception {
        return mvc.perform(post("/api/public/checkins/" + attemptId + "/complete").cookie(yd)
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of(
                        "sync2", Map.of("offsetMs", -41, "rttMs", 88),
                        "geo", Map.of("state", "SKIPPED"),
                        "camera", Map.of("idHash", HexFormat.of().formatHex(randomBytes(32)), "label", "Arka Kamera")))));
    }

    static byte[] randomBytes(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return b;
    }

    JsonNode attendance(long sessionId, String no) throws Exception {
        for (JsonNode a : body(mvc.perform(get("/api/sessions/" + sessionId + "/attendances").with(t1()))
                .andExpect(status().isOk()))) {
            if (a.get("studentNo").asString().equals(no)) return a;
        }
        return fail("no attendance for " + no);
    }

    // ---- 1. login, course, roster, session, display-config ----------------------------------

    @Test
    void loginAndTeacherSetup() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("username", "t1", "password", "yanlis"))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        MvcResult login = mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("username", "t1", "password", "parola123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("t1"))
                .andExpect(jsonPath("$.role").value("TEACHER"))
                .andReturn();
        MockHttpSession http = (MockHttpSession) login.getRequest().getSession(false);
        mvc.perform(get("/api/auth/me").session(http)).andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Öğretmen t1"));

        long courseId = createCourse(t1());
        // Duplicate course code for the same teacher is a 409, not a 500.
        String code = body(mvc.perform(get("/api/courses/" + courseId).with(t1()))).get("code").asString();
        mvc.perform(post("/api/courses").with(t1()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("code", code, "name", "x"))))
                .andExpect(status().isConflict());

        var csv = new MockMultipartFile("file", "roster.csv", "text/csv",
                "﻿ogrenciNo;adSoyad\r\n220201001;Ayşe Yılmaz\r\n220201002;Çağrı Öz\r\nabc;Hatalı\r\n"
                        .getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/courses/" + courseId + "/roster/import").file(csv).param("mode", "REPLACE")
                        .with(t1()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(2))
                .andExpect(jsonPath("$.errors[0].line").value(4));
        // Re-importing the same students with REPLACE used to violate uq_roster.
        mvc.perform(multipart("/api/courses/" + courseId + "/roster/import").file(csv).param("mode", "REPLACE")
                        .with(t1()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imported").value(2));
        mvc.perform(get("/api/courses/" + courseId + "/roster").with(t1()))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].fullName").value("Ayşe Yılmaz"));

        // geoMode/bleMode omitted → defaults from application.yml ("OFF").
        long sessionId = body(mvc.perform(post("/api/sessions").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("courseId", courseId, "title", "Hafta 1"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.geoMode").value("OFF"))
                .andExpect(jsonPath("$.code", matchesPattern("^[A-HJ-NP-Z2-9]{6}$")))).get("id").asLong();

        mvc.perform(get("/api/sessions/" + sessionId + "/display-config").with(t1()))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/sessions/" + sessionId + "/open").with(t1()).with(csrf())).andExpect(status().isOk());

        mvc.perform(get("/api/sessions/" + sessionId + "/display-config").with(t1()))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(jsonPath("$.sessionKeyB64").isString())
                .andExpect(jsonPath("$.joinUrl", endsWith("/c/" + body(mvc.perform(get("/api/sessions/" + sessionId)
                        .with(t1()))).get("code").asString())));
        mvc.perform(get("/api/sessions/" + sessionId + "/display-config").with(t2()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/api/sessions/" + sessionId + "/attendances").with(t2()))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/teachers").with(t1()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));

        // Status-only filter used to be ignored.
        mvc.perform(get("/api/sessions").param("status", "OPEN").with(t1()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].status", everyItem(is("OPEN"))));
    }

    @Test
    void sessionValidation() throws Exception {
        long courseId = createCourse(t1());
        for (Map<String, Object> bad : List.of(
                Map.<String, Object>of("refreshMs", 100),
                Map.<String, Object>of("requiredScans", 9),
                Map.<String, Object>of("durationMinutes", 0),
                Map.<String, Object>of("geoMode", "FLAG"),
                Map.<String, Object>of("bleMode", "OPTIONAL"),
                Map.<String, Object>of("geoMode", "WHATEVER"))) {
            Map<String, Object> req = new HashMap<>(Map.of("courseId", courseId, "title", "x"));
            req.putAll(bad);
            mvc.perform(post("/api/sessions").with(t1()).with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(toJson(req)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        // Another teacher's classroom cannot be attached.
        long foreignClassroom = body(mvc.perform(post("/api/classrooms").with(t2()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("name", "B-101"))))
                .andExpect(status().isCreated())).get("id").asLong();
        mvc.perform(post("/api/sessions").with(t1()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("courseId", courseId, "title", "x", "classroomId", foreignClassroom))))
                .andExpect(status().isForbidden());
        // Malformed JSON is a 400, not a 500.
        mvc.perform(post("/api/sessions").with(t1()).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content("{nope"))
                .andExpect(status().isBadRequest());

        JsonNode s = openSession(courseId);
        mvc.perform(post("/api/sessions/" + s.get("id").asLong() + "/extend").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("minutes", -5))))
                .andExpect(status().isBadRequest());
    }

    // ---- 2. happy path ---------------------------------------------------------------------

    @Test
    void happyPathCheckin() throws Exception {
        long courseId = createCourse(t1());
        String no = studentNo();
        addRoster(courseId, no, "Ayşe Yılmaz");
        S s = S.of(openSession(courseId, Map.of("requireRoster", true, "frameCapture", true)));
        Cookie yd = newDevice();

        mvc.perform(get("/api/public/sessions/" + s.code().toLowerCase()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.requiredScans").value(3))
                .andExpect(jsonPath("$.privacyNotice").isString());

        String attemptId = body(start(yd, s.code(), no).andExpect(status().isCreated())
                .andExpect(jsonPath("$.studentName").value("Ayşe Yılmaz"))).get("attemptId").asString();

        clock.setMillis(s.ts(2) + 240);
        scan(yd, attemptId, s.token(2), s.ts(2) + 180, SMALL_QR)
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.distinctValid").value(1))
                .andExpect(jsonPath("$.complete").value(false));
        // Same seq again: idempotent.
        scan(yd, attemptId, s.token(2), s.ts(2) + 400, SMALL_QR)
                .andExpect(jsonPath("$.distinctValid").value(1));

        byte[] jpeg = new byte[1000];
        jpeg[0] = (byte) 0xFF; jpeg[1] = (byte) 0xD8; jpeg[2] = (byte) 0xFF;
        mvc.perform(multipart("/api/public/checkins/" + attemptId + "/frame")
                        .file(new MockMultipartFile("frame", "f.jpg", "image/jpeg", jpeg)).param("seq", "2").cookie(yd))
                .andExpect(status().isNoContent());
        mvc.perform(multipart("/api/public/checkins/" + attemptId + "/frame")
                        .file(new MockMultipartFile("frame", "f.jpg", "image/jpeg", new byte[]{1, 2, 3})).param("seq", "2").cookie(yd))
                .andExpect(status().isNoContent());   // already stored: not overwritten

        scanSlots(yd, attemptId, s, 180, SMALL_QR, 3);
        clock.setMillis(s.ts(4) + 240);
        scan(yd, attemptId, s.token(4), s.ts(4) + 180, SMALL_QR)
                .andExpect(jsonPath("$.distinctValid").value(3))
                .andExpect(jsonPath("$.complete").value(true));

        complete(yd, attemptId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result").value("RECORDED"))
                .andExpect(jsonPath("$.studentName").value("Ayşe Yılmaz"))
                .andExpect(jsonPath("$.flags").doesNotExist());

        JsonNode att = attendance(s.id(), no);
        assertEquals("ACCEPTED", att.get("status").asString());
        assertEquals(180, att.get("minLatencyMs").asInt());
        assertTrue(att.get("hasFrame").asBoolean());
        assertTrue(att.get("present").asBoolean());

        mvc.perform(get("/api/sessions/" + s.id() + "/attendances/" + att.get("id").asLong() + "/frame").with(t1()))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG));

        verify(sseHub, atLeastOnce()).publish(eq(s.id()), eq("attendance"), any());
        verify(sseHub, atLeastOnce()).publish(eq(s.id()), eq("session"), any());

        // A completed attempt cannot be completed twice.
        complete(yd, attemptId).andExpect(status().isGone());

        // Teacher decision round-trip.
        long attId = att.get("id").asLong();
        mvc.perform(patch("/api/sessions/" + s.id() + "/attendances/" + attId).with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("decision", "REJECTED", "note", "x"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.present").value(false))
                .andExpect(jsonPath("$.decidedAt").isString());
        mvc.perform(patch("/api/sessions/" + s.id() + "/attendances/" + attId).with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("decision", "NONE"))))
                .andExpect(jsonPath("$.decidedAt").doesNotExist());
        mvc.perform(patch("/api/sessions/" + s.id() + "/attendances/" + attId).with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    // ---- 3. latency + calibration -------------------------------------------------------------

    @Test
    void latencyHighAndCalibration() throws Exception {
        long courseId = createCourse(t1());
        S s = S.of(openSession(courseId));

        // 700 ms against the default 450 ms threshold.
        Cookie slowDev = newDevice();
        String slowNo = studentNo();
        String slow = startOk(slowDev, s, slowNo);
        scanSlots(slowDev, slow, s, 700, SMALL_QR, 2, 3, 4);
        complete(slowDev, slow).andExpect(status().isOk()).andExpect(jsonPath("$.result").value("RECORDED"));
        JsonNode a = attendance(s.id(), slowNo);
        assertEquals("FLAGGED", a.get("status").asString());
        assertEquals("LATENCY_HIGH", a.get("flags").get(0).asString());
        assertEquals("DEFAULT", a.get("thresholdSource").asString());

        // 300 ms passes the default threshold.
        Cookie midDev = newDevice();
        String midNo = studentNo();
        String mid = startOk(midDev, s, midNo);
        scanSlots(midDev, mid, s, 300, SMALL_QR, 10, 11, 12);
        complete(midDev, mid).andExpect(status().isOk());
        assertEquals("ACCEPTED", attendance(s.id(), midNo).get("status").asString());

        // Calibration: 5 scans at ~100 ms, posted as a batch two seconds after the last one.
        List<Map<String, Object>> scans = new java.util.ArrayList<>();
        for (int seq = 20; seq < 25; seq++) {
            scans.add(Map.of("token", s.token(seq), "firstSeenServerMs", s.ts(seq) + 100 + (seq - 20) * 10,
                    "frameTimeSource", "captureTime", "frameW", 960, "frameH", 540, "corners", SMALL_QR));
        }
        clock.setMillis(s.ts(24) + 2000);
        mvc.perform(post("/api/sessions/" + s.id() + "/calibration-runs").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("label", "BACK", "sync", Map.of("offsetMs", -12, "rttMs", 70), "scans", scans))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.minLatencyMs").value(100))
                .andExpect(jsonPath("$.validScanCount").value(5));
        mvc.perform(get("/api/sessions/" + s.id()).with(t1()))
                .andExpect(jsonPath("$.baselineLatencyMs").value(100))
                .andExpect(jsonPath("$.effectiveLatencyThresholdMs").value(250))
                .andExpect(jsonPath("$.thresholdSource").value("CALIBRATED"));

        // Replaying old calibration data is refused.
        clock.advance(Duration.ofSeconds(40));
        mvc.perform(post("/api/sessions/" + s.id() + "/calibration-runs").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("label", "BACK", "sync", Map.of("offsetMs", -12, "rttMs", 70), "scans", scans))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_ENOUGH_SCANS"));

        // New check-ins use the calibrated threshold.
        int base = (int) ((clock.millis() - s.epoch()) / 1000) + 1;
        Cookie newDev = newDevice();
        String newNo = studentNo();
        String n = startOk(newDev, s, newNo);
        scanSlots(newDev, n, s, 300, SMALL_QR, base, base + 1, base + 2);
        complete(newDev, n).andExpect(status().isOk());
        JsonNode na = attendance(s.id(), newNo);
        assertEquals("FLAGGED", na.get("status").asString());
        assertEquals("CALIBRATED", na.get("thresholdSource").asString());
        assertEquals(250, na.get("latencyThresholdMs").asInt());

        // Re-evaluation applies the calibrated threshold to the earlier 300 ms record.
        mvc.perform(post("/api/sessions/" + s.id() + "/reevaluate").with(t1()).with(csrf()))
                .andExpect(status().isOk());
        JsonNode midAfter = attendance(s.id(), midNo);
        assertEquals("FLAGGED", midAfter.get("status").asString());
        assertEquals("NONE", midAfter.get("teacherDecision").asString());
    }

    // ---- 4. screen suspect ----------------------------------------------------------------------

    @Test
    void screenSuspect() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        Cookie yd = newDevice();
        String no = studentNo();
        String attemptId = startOk(yd, s, no);
        scanSlots(yd, attemptId, s, 180, BIG_QR, 2, 3, 4);
        complete(yd, attemptId).andExpect(status().isOk());
        JsonNode a = attendance(s.id(), no);
        assertEquals("FLAGGED", a.get("status").asString());
        assertEquals("SCREEN_SUSPECT", a.get("flags").get(0).asString());
        assertTrue(a.get("areaRatioMax").asDouble() > 0.5);
    }

    // ---- 5. expired tokens, rejected attempts --------------------------------------------------

    @Test
    void expiredTokensAndRejectedAttempt() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        Cookie yd = newDevice();
        String no = studentNo();
        String attemptId = startOk(yd, s, no);
        for (int seq = 2; seq <= 4; seq++) {
            clock.setMillis(s.ts(seq) + 4500);
            scan(yd, attemptId, s.token(seq), s.ts(seq) + 200, SMALL_QR)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.valid").value(false))
                    .andExpect(jsonPath("$.reason").value("TOKEN_EXPIRED"));
        }
        complete(yd, attemptId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_ENOUGH_SCANS"));

        // The rejection is persisted (it used to be rolled back) and published.
        mvc.perform(get("/api/sessions/" + s.id() + "/attempts").param("state", "REJECTED").with(t1()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].studentNo").value(no))
                .andExpect(jsonPath("$[0].resultCode").value("NOT_ENOUGH_SCANS"));
        verify(sseHub, atLeastOnce()).publish(eq(s.id()), eq("attempt-rejected"), any());
        mvc.perform(get("/api/sessions/" + s.id() + "/attempts").param("state", "bogus").with(t1()))
                .andExpect(status().isBadRequest());
    }

    // ---- 6, 7, 8, 9. hard rejections --------------------------------------------------------

    @Test
    void deviceAndStudentReuse() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        Cookie yd = newDevice();
        String no = studentNo();
        String attemptId = startOk(yd, s, no);
        scanSlots(yd, attemptId, s, 180, SMALL_QR, 2, 3, 4);
        complete(yd, attemptId).andExpect(status().isOk());

        start(yd, s.code(), studentNo())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEVICE_ALREADY_USED"));
        start(newDevice(), s.code(), no)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ALREADY_CHECKED_IN"));
    }

    @Test
    void attemptOfAnotherDevice() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        String attemptId = startOk(newDevice(), s, studentNo());
        clock.setMillis(s.ts(2) + 240);
        scan(newDevice(), attemptId, s.token(2), s.ts(2) + 180, SMALL_QR)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ATTEMPT_NOT_FOUND"));
        complete(newDevice(), attemptId).andExpect(status().isNotFound());
    }

    @Test
    void notInRoster() throws Exception {
        long courseId = createCourse(t1());
        addRoster(courseId, studentNo(), "Biri");
        S s = S.of(openSession(courseId, Map.of("requireRoster", true)));
        start(newDevice(), s.code(), studentNo())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("NOT_IN_ROSTER"));
        start(newDevice(), s.code(), "12")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        start(newDevice(), "ZZZZZZ", studentNo())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_FOUND"));
    }

    @Test
    void closedSession() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        Cookie yd = newDevice();
        String no = studentNo();
        String attemptId = startOk(yd, s, no);
        scanSlots(yd, attemptId, s, 180, SMALL_QR, 2, 3, 4);

        mvc.perform(post("/api/sessions/" + s.id() + "/close").with(t1()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));

        complete(yd, attemptId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_OPEN"));
        start(newDevice(), s.code(), studentNo())
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SESSION_NOT_OPEN"));
        mvc.perform(get("/api/public/sessions/" + s.code()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CLOSED"));
        mvc.perform(get("/api/sessions/" + s.id() + "/attempts").with(t1()))
                .andExpect(jsonPath("$[0].resultCode").value("SESSION_NOT_OPEN"));
    }

    // ---- 10. BLE --------------------------------------------------------------------------------

    @Test
    void bleVerificationSuppressesLatencyFlag() throws Exception {
        long classroomId = body(mvc.perform(post("/api/classrooms").with(t1()).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("name", "A-101", "bleBeaconId", "101"))))
                .andExpect(status().isCreated())).get("id").asLong();
        String keyHex = body(mvc.perform(post("/api/classrooms/" + classroomId + "/ble-key").with(t1()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beaconId").value("101"))).get("keyHex").asString();
        mvc.perform(get("/api/classrooms").with(t1()))
                .andExpect(jsonPath("$[?(@.id == " + classroomId + ")].hasBleKey").value(true))
                .andExpect(content().string(not(containsString(keyHex))));

        S s = S.of(openSession(createCourse(t1()), Map.of("classroomId", classroomId, "bleMode", "OPTIONAL")));
        Cookie yd = newDevice();
        String no = studentNo();
        String attemptId = startOk(yd, s, no);
        scanSlots(yd, attemptId, s, 700, SMALL_QR, 2, 3, 4);

        JsonNode nonce = body(mvc.perform(post("/api/public/checkins/" + attemptId + "/ble-nonce").cookie(yd))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beaconName").value("YKL-101"))
                .andExpect(jsonPath("$.nonce", matchesPattern("^[A-Z2-7]{16}$"))));
        String response = BleChallenge.response(HexFormat.of().parseHex(keyHex), nonce.get("nonce").asString());
        mvc.perform(post("/api/public/checkins/" + attemptId + "/ble").cookie(yd)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("response", response))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verified").value(true));
        // Single use.
        mvc.perform(post("/api/public/checkins/" + attemptId + "/ble").cookie(yd)
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("response", response))))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("BLE_NONCE_EXPIRED"));

        complete(yd, attemptId).andExpect(status().isOk());
        JsonNode a = attendance(s.id(), no);
        assertEquals("ACCEPTED", a.get("status").asString());
        assertTrue(a.get("bleVerified").asBoolean());
        assertEquals(700, a.get("minLatencyMs").asInt());

        // Expired nonce.
        Cookie yd2 = newDevice();
        String second = startOk(yd2, s, studentNo());
        String n2 = body(mvc.perform(post("/api/public/checkins/" + second + "/ble-nonce").cookie(yd2))).get("nonce").asString();
        clock.advance(Duration.ofSeconds(61));
        mvc.perform(post("/api/public/checkins/" + second + "/ble").cookie(yd2)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("response", BleChallenge.response(HexFormat.of().parseHex(keyHex), n2)))))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.code").value("BLE_NONCE_EXPIRED"));
    }

    @Test
    void bleNonceRequiresBleMode() throws Exception {
        S s = S.of(openSession(createCourse(t1())));
        Cookie yd = newDevice();
        String attemptId = startOk(yd, s, studentNo());
        mvc.perform(post("/api/public/checkins/" + attemptId + "/ble-nonce").cookie(yd))
                .andExpect(status().isConflict());
    }

    // ---- 11. rate limit -------------------------------------------------------------------------

    @Test
    void rateLimitPerDevice() throws Exception {
        Cookie yd = newDevice();
        String path = "/api/public/checkins/" + java.util.UUID.randomUUID() + "/sync";
        String bodyJson = toJson(Map.of("offsetMs", 0, "rttMs", 50));
        for (int i = 0; i < 120; i++) {
            mvc.perform(post(path).cookie(yd).contentType(MediaType.APPLICATION_JSON).content(bodyJson))
                    .andExpect(status().isNotFound());
        }
        mvc.perform(post(path).cookie(yd).contentType(MediaType.APPLICATION_JSON).content(bodyJson))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.code").value("RATE_LIMITED"));
        // Other devices are unaffected.
        mvc.perform(post(path).cookie(newDevice()).contentType(MediaType.APPLICATION_JSON).content(bodyJson))
                .andExpect(status().isNotFound());
        // GET /time is never limited.
        mvc.perform(get("/api/public/time").cookie(yd)).andExpect(status().isOk());
    }

    // ---- 12. CSV --------------------------------------------------------------------------------

    @Test
    void csvExportListsAbsentStudents() throws Exception {
        long courseId = createCourse(t1());
        String present = studentNo();
        String absent = studentNo();
        addRoster(courseId, present, "Gelen Öğrenci");
        addRoster(courseId, absent, "Gelmeyen Öğrenci");
        // requireRoster=false: absentees are listed whenever a roster exists.
        S s = S.of(openSession(courseId));
        mvc.perform(post("/api/sessions/" + s.id() + "/attendances/manual").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("studentNo", present, "note", "=1+1"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.teacherDecision").value("APPROVED"))
                .andExpect(jsonPath("$.fullName").value("Gelen Öğrenci"));
        mvc.perform(post("/api/sessions/" + s.id() + "/attendances/manual").with(t1()).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("studentNo", present))))
                .andExpect(status().isConflict());

        MvcResult r = mvc.perform(get("/api/sessions/" + s.id() + "/export.csv").with(t1()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", startsWith("text/csv")))
                .andExpect(header().string("Content-Disposition", startsWith("attachment")))
                .andReturn();
        String csv = new String(r.getResponse().getContentAsByteArray(), StandardCharsets.UTF_8);
        assertTrue(csv.startsWith("﻿ogrenciNo;"));
        assertTrue(csv.contains(present + ";Gelen Öğrenci;ONAYLANDI;EVET;"));
        assertTrue(csv.contains("\"'=1+1\""));
        assertTrue(csv.contains(absent + ";Gelmeyen Öğrenci;GELMEDI;HAYIR"));

        long attId = attendance(s.id(), present).get("id").asLong();
        mvc.perform(delete("/api/sessions/" + s.id() + "/attendances/" + attId).with(t1()).with(csrf()))
                .andExpect(status().isNoContent());
        verify(sseHub, atLeastOnce()).publish(eq(s.id()), eq("attendance-deleted"), any());
    }

    // ---- 13. CSRF -------------------------------------------------------------------------------

    @Test
    void csrfRequiredForTeacherApiButNotPublic() throws Exception {
        mvc.perform(post("/api/courses").with(t1()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("code", "X1", "name", "x"))))
                .andExpect(status().isForbidden());
        // No CSRF token on a public POST: reaches the controller (404 for an unknown session).
        start(newDevice(), "ZZZZZZ", studentNo()).andExpect(status().isNotFound());
        // Device cookie is issued on public endpoints.
        mvc.perform(get("/api/public/time"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(cookie().exists("YD"))
                .andExpect(cookie().httpOnly("YD", true));
    }

    // ---- 14. SPA and errors ---------------------------------------------------------------------

    @Test
    void spaRoutingAndJsonErrors() throws Exception {
        mvc.perform(get("/api/olmayan").with(t1()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        mvc.perform(get("/")).andExpect(header().string("Permissions-Policy", containsString("camera=(self)")))
                .andExpect(header().string("Content-Security-Policy", containsString("'wasm-unsafe-eval'")));

        assumeTrue(new ClassPathResource("static/index.html").exists(), "frontend build not on classpath");
        mvc.perform(get("/t/sessions/5"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-cache"))
                .andExpect(content().string(containsString("<app-root")));
        mvc.perform(get("/chunk-doesnotexist.js")).andExpect(status().isNotFound());
        if (new ClassPathResource("static/zxing/zxing_reader.wasm").exists()) {
            mvc.perform(get("/zxing/zxing_reader.wasm"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType("application/wasm"));
        }
    }
}
