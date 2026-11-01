package com.yoklama.checkin;

import java.util.Locale;

/** QR corner helpers for the screen-reading heuristic (02 §8). */
public final class ScanGeometry {

    private ScanGeometry() {}

    /** True for exactly four finite {@code [x, y]} points. */
    public static boolean validCorners(double[][] corners) {
        if (corners == null || corners.length != 4) return false;
        for (double[] p : corners) {
            if (p == null || p.length != 2 || !Double.isFinite(p[0]) || !Double.isFinite(p[1])) return false;
        }
        return true;
    }

    /** Shoelace area of the quadrilateral divided by the frame area; {@code null} when not computable. */
    public static Double areaRatio(double[][] corners, int frameW, int frameH) {
        if (!validCorners(corners) || frameW <= 0 || frameH <= 0) return null;
        double area = 0;
        for (int i = 0; i < 4; i++) {
            int j = (i + 1) % 4;
            area += corners[i][0] * corners[j][1] - corners[j][0] * corners[i][1];
        }
        return Math.abs(area) / 2 / ((double) frameW * frameH);
    }

    /** {@code [[x,y],...]} with one decimal, independent of the JVM locale. */
    public static String format(double[][] corners) {
        if (!validCorners(corners)) return null;
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < corners.length; i++) {
            if (i > 0) sb.append(',');
            sb.append('[').append(String.format(Locale.ROOT, "%.1f", corners[i][0]))
              .append(',').append(String.format(Locale.ROOT, "%.1f", corners[i][1])).append(']');
        }
        String s = sb.append(']').toString();
        return s.length() <= 400 ? s : null;
    }
}
