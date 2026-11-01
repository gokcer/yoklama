package com.yoklama;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.servlet.http.Cookie;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Real CSRF cookie round-trip as the SPA does it. Runs in its own context: Spring Security's
 * {@code csrf()} test post-processor (used elsewhere) replaces the filter's token repository.
 */
@SpringBootTest(properties = "spring.application.name=yoklama-csrf-test")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CsrfCookieTest {

    @Autowired MockMvc mvc;

    @Test
    void spaCsrfFlow() throws Exception {
        MvcResult csrf = mvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isNoContent())
                .andExpect(cookie().exists("XSRF-TOKEN"))
                .andExpect(cookie().httpOnly("XSRF-TOKEN", false))
                .andReturn();
        Cookie token = csrf.getResponse().getCookie("XSRF-TOKEN");

        String login = "{\"username\":\"admin\",\"password\":\"admin123\"}";
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isForbidden());

        MvcResult ok = mvc.perform(post("/api/auth/login").cookie(token).header("X-XSRF-TOKEN", token.getValue())
                        .contentType(MediaType.APPLICATION_JSON).content(login))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andReturn();
        MockHttpSession session = (MockHttpSession) ok.getRequest().getSession(false);

        mvc.perform(get("/api/admin/teachers").session(session)).andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").session(session).cookie(token).header("X-XSRF-TOKEN", token.getValue()))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
    }
}
