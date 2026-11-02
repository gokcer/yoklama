package com.yoklama.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;
import java.util.regex.Pattern;

@Configuration
public class SpaWebConfig implements WebMvcConfigurer {

    /** Angular build output names hashed assets like {@code main-V6MZKRPE.js} / {@code chunk-qE7lafhP.js}. */
    private static final Pattern HASHED_ASSET = Pattern.compile(".*-[A-Za-z0-9_-]{8,}\\.(js|css|woff2?)$");

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                // Jar entries all carry the same 1980 timestamp, so Last-Modified would answer 304 with the
                // previous deployment's index.html; hashed bundles don't need it either.
                .setUseLastModified(false)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String path, Resource location) throws IOException {
                        if (path.startsWith("api/") || path.startsWith("actuator/")) {
                            return null;
                        }
                        Resource requested = location.createRelative(path);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        // /q/<token> paths contain dots but are SPA deep links (QR URLs).
                        if (path.startsWith("q/")) {
                            return location.createRelative("index.html");
                        }
                        // Missing files (e.g. a stale chunk after a deploy) are 404s, not the SPA shell.
                        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
                        if (lastSegment.contains(".")) {
                            return null;
                        }
                        return location.createRelative("index.html");
                    }
                });
    }

    /**
     * Hashed bundles are immutable (1 year); everything else outside the API (index.html and SPA deep
     * links, which resolve to index.html) must be revalidated so a new deployment is picked up.
     * API responses are never stored unless a controller sets its own Cache-Control.
     */
    @Bean
    public FilterRegistrationBean<OncePerRequestFilter> staticCacheHeadersFilter() {
        OncePerRequestFilter filter = new OncePerRequestFilter() {
            @Override
            protected boolean shouldNotFilter(HttpServletRequest request) {
                String uri = request.getRequestURI();
                return uri.startsWith("/actuator/");
            }

            @Override
            protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                            FilterChain chain) throws ServletException, IOException {
                String uri = request.getRequestURI();
                if (uri.startsWith("/api/") || !"GET".equals(request.getMethod())) {
                    response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
                } else if (HASHED_ASSET.matcher(uri).matches()) {
                    response.setHeader(HttpHeaders.CACHE_CONTROL, "public, max-age=31536000, immutable");
                } else {
                    response.setHeader(HttpHeaders.CACHE_CONTROL, "no-cache");
                }
                chain.doFilter(request, response);
            }
        };
        FilterRegistrationBean<OncePerRequestFilter> reg = new FilterRegistrationBean<>(filter);
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return reg;
    }
}
