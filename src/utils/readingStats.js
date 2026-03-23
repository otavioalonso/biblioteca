/**
 * Reading Statistics Module
 * 
 * Tracks reading time against book position (percentage-based bins).
 * 
 * DESIGN: Since pagination changes with font size / margins, we cannot use
 * page numbers as stable keys. Instead we divide the book into N fixed
 * "position bins" (0-100% of the book) and accumulate seconds spent in each
 * bin. When the user is on a displayed "page", we know its start% and end%
 * from epub.js CFI locations, and we distribute the elapsed time across the
 * bins that overlap that range.
 *
 * All data is persisted via the storage adapter passed in (cookies / localStorage).
 */

const NUM_BINS = 200; // granularity — 0.5% each

/**
 * Maximum reading rate used to floor time-left estimates.
 * Even if EWMA pace drifts very low (e.g. rapid skimming / fast page turns),
 * estimates will never assume faster than MAX_WPM words per minute.
 *
 * The minimum pace (seconds per bin) is derived from the book's actual word
 * count (set after epub.js locations.generate finishes):
 *   wordsPerBin = wordCount / NUM_BINS
 *   minPace     = (wordsPerBin / MAX_WPM) * 60
 */
const MAX_WPM = 400;
const MIN_WPM = 100;   // slower than this → reader was idle / distracted
const DEFAULT_WPM = 200; // fallback pace when no reading data is available yet

/* ------------------------------------------------------------------ */
/*  Core helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Create a fresh stats object for a book.
 */
export function createBookStats(bookId) {
  return {
    bookId,
    bins: new Array(NUM_BINS).fill(0), // seconds per bin
    totalReadingTime: 0,               // total seconds spent reading
    sessionsCount: 0,
    lastOpenedAt: null,
    wordCount: 0,                      // total words in book (set after locations generate)
    // EWMA pace tracking (seconds per bin)
    ewmaPace: 0,       // exponentially weighted moving average
    ewmaVariance: 0,   // variance tracker for outlier clamping
    ewmaSamples: 0,    // number of observations fed into EWMA
  };
}

/**
 * Store the book's word count (call once after epub.js locations.generate).
 */
export function setWordCount(stats, wordCount) {
  return { ...stats, wordCount };
}

/**
 * Return the bin index for a given percentage (0–1).
 */
export function binIndex(pct) {
  const i = Math.floor(pct * NUM_BINS);
  return Math.min(i, NUM_BINS - 1);
}

/**
 * Record `seconds` of reading time for a page spanning [startPct, endPct]
 * (both 0–1). Time is distributed evenly across overlapping bins.
 *
 * If the book's wordCount is known, the observation is converted to WPM
 * and silently rejected if outside [MIN_WPM, MAX_WPM]. This keeps bins
 * and EWMA free of idle / page-flipping noise.
 *
 * Also updates an exponentially weighted moving average (EWMA) of pace
 * (seconds per bin) used for time-left estimates.
 */
const EWMA_ALPHA = 0.3;           // smoothing factor — higher = more reactive

export function recordPageTime(stats, startPct, endPct, seconds) {
  if (seconds <= 0 || startPct >= endPct) return stats;

  const lo = binIndex(startPct);
  const hi = binIndex(endPct);
  const count = hi - lo + 1;
  const perBin = seconds / count;

  /* --- Pace validity gate ----------------------------------------- */
  const wc = stats.wordCount || 0;
  if (wc > 0) {
    const wordsPerBin = wc / NUM_BINS;
    const wordsRead = wordsPerBin * count;
    const minutes = seconds / 60;
    const wpm = wordsRead / minutes;

    console.log('[Stats]', {
      seconds: seconds.toFixed(1),
      bins: `${lo}-${hi} (${count})`,
      wpm: Math.round(wpm),
      perBin: perBin.toFixed(2),
      accepted: wpm <= MAX_WPM && wpm >= MIN_WPM,
    });

    if (wpm > MAX_WPM || wpm < MIN_WPM) {
      // Outside realistic reading range — discard this observation
      return stats;
    }
  }

  const newBins = [...stats.bins];
  for (let i = lo; i <= hi; i++) {
    newBins[i] += perBin;
  }

  /* --- Update EWMA pace ------------------------------------------- */
  let { ewmaPace, ewmaVariance, ewmaSamples } = stats;

  // Initialise defaults for stats created before EWMA was added
  if (ewmaPace == null) ewmaPace = 0;
  if (ewmaVariance == null) ewmaVariance = 0;
  if (ewmaSamples == null) ewmaSamples = 0;

  const observation = perBin; // seconds-per-bin for this page turn

  if (ewmaSamples === 0) {
    ewmaPace = observation;
    ewmaVariance = observation * observation;
    ewmaSamples = 1;
  } else {
    ewmaPace = ewmaPace + EWMA_ALPHA * (observation - ewmaPace);
    const diff = observation - ewmaPace;
    ewmaVariance = ewmaVariance + EWMA_ALPHA * (diff * diff - ewmaVariance);
    ewmaSamples += 1;
  }

  return {
    ...stats,
    bins: newBins,
    totalReadingTime: stats.totalReadingTime + seconds,
    ewmaPace,
    ewmaVariance,
    ewmaSamples,
  };
}

/* ------------------------------------------------------------------ */
/*  Derived metrics                                                    */
/* ------------------------------------------------------------------ */

/**
 * Average seconds per bin (only bins that have been read).
 * Used as fallback when EWMA data is not yet available.
 */
export function averageSecondsPerBin(stats) {
  const read = stats.bins.filter((t) => t > 0);
  if (read.length === 0) return 0;
  return read.reduce((a, b) => a + b, 0) / read.length;
}

/**
 * Current pace estimate (seconds per bin).
 * Prefers EWMA (recent-weighted, outlier-resistant); falls back to simple avg.
 * If no reading data exists yet, falls back to DEFAULT_WPM (200 WPM).
 * Floored so estimates never assume faster than MAX_WPM.
 */
function currentPace(stats) {
  const wc = stats.wordCount || 0;
  const wordsPerBin = wc > 0 ? wc / NUM_BINS : 0;

  let pace;
  if (stats.ewmaSamples > 0 && stats.ewmaPace > 0) {
    pace = stats.ewmaPace;
  } else {
    pace = averageSecondsPerBin(stats);
  }

  // No measured data — use default 200 WPM if word count is known
  if (pace === 0) {
    if (wordsPerBin > 0) {
      return (wordsPerBin / DEFAULT_WPM) * 60;
    }
    return 0;
  }

  // Floor at MAX_WPM so estimates are never unrealistically short
  // Ceiling at MIN_WPM so estimates are never unrealistically long
  if (wordsPerBin > 0) {
    const minPace = (wordsPerBin / MAX_WPM) * 60;
    const maxPace = (wordsPerBin / MIN_WPM) * 60;
    return Math.min(Math.max(pace, minPace), maxPace);
  }
  return pace;
}

/**
 * Estimate seconds remaining in the book from currentPct (0–1).
 */
export function estimateBookTimeLeft(stats, currentPct) {
  const pace = currentPace(stats);
  if (pace === 0) return null; // not enough data
  const binsLeft = NUM_BINS - binIndex(currentPct) - 1;
  return Math.round(binsLeft * pace);
}

/**
 * Estimate seconds remaining in the current chapter.
 * chapterEndPct is 0–1.
 */
export function estimateChapterTimeLeft(stats, currentPct, chapterEndPct) {
  const pace = currentPace(stats);
  if (pace === 0) return null;
  const curBin = binIndex(currentPct);
  const endBin = binIndex(Math.min(chapterEndPct, 1));
  const binsLeft = Math.max(0, endBin - curBin);
  return Math.round(binsLeft * pace);
}

/**
 * Format seconds into a human readable string.
 */
export function formatTime(totalSeconds) {
  if (totalSeconds == null) return '—';
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/**
 * Return an array of { bin, seconds, color } for the heatmap.
 * Uses a value scale that adapts to the current theme:
 *   light → light-gray (unread) to black (slow)
 *   dark  → dark-gray (unread) to white (slow)
 *   sepia → sepia-toned from light to dark
 * Works well on e-ink (pure lightness gradient, no hue dependency).
 */
export function heatmapData(stats, theme = 'light') {
  /*
   * Use the WPM range [MIN_WPM, MAX_WPM] to derive the expected
   * seconds-per-bin bounds, giving a fixed & meaningful color scale.
   * Falls back to max-bin normalisation when wordCount is unknown.
   */
  const wc = stats.wordCount || 0;
  const wordsPerBin = wc > 0 ? wc / NUM_BINS : 0;

  let fastTime, slowTime;
  if (wordsPerBin > 0) {
    fastTime = (wordsPerBin / MAX_WPM) * 60; // seconds per bin at fastest pace
    slowTime = (wordsPerBin / MIN_WPM) * 60; // seconds per bin at slowest pace
  } else {
    // No word count yet — fall back to relative normalisation
    const maxBin = Math.max(...stats.bins, 0.001);
    fastTime = 0;
    slowTime = maxBin;
  }

  // Each theme defines: unread color (matches background), and lightness range [fast, slow]
  const palettes = {
    light: { unread: '#ffffff',  hue: 0,   sat: 0,  fastL: 88, slowL: 10 },
    dark:  { unread: '#1e1e1e',  hue: 0,   sat: 0,  fastL: 12, slowL: 95 },
    sepia: { unread: '#f4ecd8',  hue: 35,  sat: 35, fastL: 85, slowL: 20 },
  };
  const p = palettes[theme] || palettes.light;
  const range = slowTime - fastTime;

  return stats.bins.map((seconds, bin) => {
    if (seconds <= 0) {
      return { bin, seconds, color: p.unread };
    }
    const ratio = range > 0
      ? Math.min(1, Math.max(0, (seconds - fastTime) / range))
      : 0.5;
    const lightness = Math.round(p.fastL + (p.slowL - p.fastL) * ratio);
    return { bin, seconds, color: `hsl(${p.hue}, ${p.sat}%, ${lightness}%)` };
  });
}

/**
 * Overall reading progress 0–1.
 */
export function readingProgress(stats) {
  const read = stats.bins.filter((t) => t > 0).length;
  return read / NUM_BINS;
}

export { NUM_BINS };
