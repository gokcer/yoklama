export const FLAG_LABELS: Record<string, string> = {
  LATENCY_HIGH: 'Yüksek gecikme',
  SCREEN_SUSPECT: 'Ekran şüphesi',
  NO_FRAME: 'Kare yok',
  CLOCK_POOR: 'Saat zayıf',
  CLOCK_INCONSISTENT: 'Saat tutarsız',
  GEO_OUTSIDE: 'Alan dışı',
  GEO_LOW_ACCURACY: 'Konum belirsiz',
  GEO_UNAVAILABLE: 'Konum yok',
  CAMERA_REUSED: 'Kamera tekrarı',
};

/** Dashboard explanations, verbatim from 07 §3. */
export const FLAG_DESCRIPTIONS: Record<string, string> = {
  LATENCY_HIGH: 'Optik gecikme eşiğin üzerinde (olası canlı aktarım)',
  SCREEN_SUSPECT: 'QR karede çok büyük (olası ekrandan okuma)',
  NO_FRAME: 'Kamera karesi yüklenmedi',
  CLOCK_POOR: 'Saat senkronu zayıf, gecikme ölçümü güvenilmez',
  CLOCK_INCONSISTENT: 'Saat tutarsız',
  GEO_OUTSIDE: 'Derslik alanı dışında',
  GEO_LOW_ACCURACY: 'Konum doğruluğu düşük',
  GEO_UNAVAILABLE: 'Konum alınamadı',
  CAMERA_REUSED: 'Aynı kamera başka öğrencide kullanılmış',
};
