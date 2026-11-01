package com.yoklama.security;

import com.yoklama.common.ErrorCode;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.security.web.header.writers.StaticHeadersWriter;

@Configuration
public class SecurityConfig {

    static final String CSP = "default-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; "
            + "script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'";

    @Bean
    public PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }

    @Bean
    public SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    public DaoAuthenticationProvider daoAuthenticationProvider(
            TeacherUserDetailsService userDetailsService, PasswordEncoder encoder) {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(encoder);
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    // The filters are added to the security chain explicitly; keep Boot from also registering them
    // as plain servlet filters.
    @Bean
    public FilterRegistrationBean<DeviceCookieFilter> deviceCookieFilterRegistration(DeviceCookieFilter f) {
        FilterRegistrationBean<DeviceCookieFilter> reg = new FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public FilterRegistrationBean<RateLimitFilter> rateLimitFilterRegistration(RateLimitFilter f) {
        FilterRegistrationBean<RateLimitFilter> reg = new FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   SecurityContextRepository ctxRepo,
                                                   DeviceCookieFilter deviceCookieFilter,
                                                   RateLimitFilter rateLimitFilter) throws Exception {
        http
            .securityContext(sc -> sc.securityContextRepository(ctxRepo))
            .csrf(csrf -> csrf
                .spa()
                .ignoringRequestMatchers("/api/public/**"))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**", "/api/auth/login", "/api/auth/csrf",
                        "/actuator/health").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/**", "/actuator/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(e -> e
                .authenticationEntryPoint((req, res, ex) -> JsonErrors.write(res, ErrorCode.UNAUTHORIZED))
                .accessDeniedHandler((req, res, ex) -> JsonErrors.write(res, ErrorCode.FORBIDDEN)))
            .formLogin(AbstractHttpConfigurer::disable)
            .httpBasic(AbstractHttpConfigurer::disable)
            .logout(l -> l.logoutUrl("/api/auth/logout")
                .logoutSuccessHandler((req, res, a) -> res.setStatus(204)))
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(deviceCookieFilter, RateLimitFilter.class)
            .headers(h -> {
                h.contentSecurityPolicy(csp -> csp.policyDirectives(CSP));
                h.referrerPolicy(rp -> rp.policy(ReferrerPolicy.SAME_ORIGIN));
                h.addHeaderWriter(new StaticHeadersWriter("Permissions-Policy",
                        "camera=(self), geolocation=(self), bluetooth=(self)"));
            });
        return http.build();
    }
}
