import { useEffect, useRef, useState, useCallback } from 'react';
import ePub from 'epubjs';
import HeatmapBar from './HeatmapBar';
import SettingsPanel from './SettingsPanel';
import setThemeColor from '../utils/themeColor';
import {
  loadBookFile,
  loadStats,
  saveStats,
  loadProgressCookie,
  saveProgressCookie,
  loadSettings,
  saveSettings,
} from '../utils/storage';
import {
  createBookStats,
  recordPageTime,
  setWordCount,
  binIndex,
  estimateBookTimeLeft,
  estimateChapterTimeLeft,
  formatTime,
} from '../utils/readingStats';

const TICK_INTERVAL = 1000; // record time every second
const IDLE_TIMEOUT = 180;   // seconds — stop counting after 3 min on same page

export default function Reader({ bookId, bookMeta, onClose, onDelete, onResetData }) {
  const viewerRef = useRef(null);
  const renditionRef = useRef(null);
  const bookRef = useRef(null);
  const tickRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const pageStartRef = useRef(null);    // { time, startPct, endPct }
  const holdRef = useRef(null);         // long-press repeat state

  const [stats, setStats] = useState(() => createBookStats(bookId));
  const [currentPct, setCurrentPct] = useState(0);
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterEndPct, setChapterEndPct] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [settings, setSettings] = useState(() => loadSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ---- Computed stats --------------------------------------------- */
  const bookTimeLeft = estimateBookTimeLeft(stats, currentPct);
  const chapTimeLeft = estimateChapterTimeLeft(stats, currentPct, chapterEndPct);
  const currentBin = binIndex(currentPct);

  /* ---- Helper: flush accumulated time for current page ------------ */
  const flushPageTime = useCallback(() => {
    const p = pageStartRef.current;
    if (!p) return;
    const elapsed = Math.min((Date.now() - p.time) / 1000, IDLE_TIMEOUT);
    if (elapsed > 0.5) {
      setStats((prev) => {
        const next = recordPageTime(prev, p.startPct, p.endPct, elapsed);
        saveStats(bookId, next);
        return next;
      });
    }
    pageStartRef.current = null;
  }, [bookId]);

  /* ---- Start timing a new page ------------------------------------ */
  const startPageTimer = useCallback((startPct, endPct) => {
    pageStartRef.current = { time: Date.now(), startPct, endPct };
  }, []);

  /* ---- Initialise book -------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const buf = await loadBookFile(bookId);
        if (!buf || cancelled) {
          if (!buf) setError('Book file not found in storage.');
          return;
        }

        const savedStats = await loadStats(bookId);
        if (!cancelled) setStats(savedStats);

        const book = ePub(buf);
        bookRef.current = book;

        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated',
          gap: 0,
        });
        renditionRef.current = rendition;

        /* Snap rendition to integer pixel dimensions so CSS columns
           don't clip the last line of text on a page. */
        const ro = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const w = Math.floor(entry.contentRect.width);
            const h = Math.floor(entry.contentRect.height);
            if (w > 0 && h > 0 && renditionRef.current?.manager) {
              renditionRef.current.resize(w, h);
            }
          }
        });
        ro.observe(viewerRef.current);
        resizeObserverRef.current = ro;

        /* Apply settings (font, theme — margin needs manager, applied after display) */
        applySettings(rendition, settings);

        /* Restore position from cookie */
        const saved = loadProgressCookie(bookId);
        if (saved?.location) {
          await rendition.display(saved.location);
        } else {
          await rendition.display();
        }

        if (!cancelled) setLoading(false);

        /* Navigation generated */
        await book.loaded.navigation;

        /* Register relocated handler immediately so no events are missed */
        rendition.on('relocated', (location) => {
          if (cancelled) return;
          /* Flush old page time */
          flushPageTime();

          const pct = location.start.percentage || 0;
          const endPct = location.end?.percentage || pct + 0.005;
          setCurrentPct(pct);

          /* Page numbers (only available after locations.generate) */
          const total = book.locations.length();
          if (total > 0) {
            const loc = book.locations.locationFromCfi(location.start.cfi);
            if (loc >= 0) {
              setCurrentPage(loc + 1);
              setTotalPages(total);
            }
          }

          /* Save position cookie */
          saveProgressCookie(bookId, location.start.cfi, pct);

          /* Start timing new page */
          startPageTimer(pct, endPct);

          /* Chapter info */
          const href = location.start.href;
          const toc = book.navigation?.toc || [];
          const spine = book.spine?.items || [];

          console.log('[Chapter Debug]', {
            href,
            tocLength: toc.length,
            tocEntries: toc.map(t => t.href).slice(0, 10),
            spineLength: spine.length,
            pct,
          });

          /* Flatten nested TOC (some books have sub-chapters) */
          const flatToc = [];
          const flatten = (items) => {
            for (const item of items) {
              flatToc.push(item);
              if (item.subitems?.length) flatten(item.subitems);
            }
          };
          flatten(toc);

          /* Match current href to TOC — use findLast so nested/later
             entries (more specific) win over earlier parent entries */
          const hrefBase = href.split('#')[0];
          let chIdx = -1;
          for (let i = flatToc.length - 1; i >= 0; i--) {
            const tocHref = flatToc[i].href.split('#')[0];
            if (tocHref === hrefBase || hrefBase.endsWith(tocHref) || tocHref.endsWith(hrefBase)) {
              chIdx = i;
              break;
            }
          }

          if (chIdx >= 0) {
            const ch = flatToc[chIdx];
            setChapterTitle(ch.label?.trim() || '');

            /* Find next chapter start to compute chapter end pct */
            if (chIdx < flatToc.length - 1) {
              const nextCh = flatToc[chIdx + 1];
              const nextHref = nextCh.href.split('#')[0];
              const spineItem = spine.find((s) => {
                const sHref = s.href.split('#')[0];
                return sHref === nextHref || sHref.endsWith(nextHref) || nextHref.endsWith(sHref);
              });
              
              let computedEndPct;
              if (spineItem) {
                /* Try to get accurate % via locations */
                const locTotal = book.locations.length();
                if (locTotal > 0) {
                  /* Build a valid CFI pointing to the very start of the
                     spine item: epubcfi(<cfiBase>!/4/1:0)
                     /4 = body, /1 = first child, :0 = char offset 0 */
                  const startCfi = `epubcfi(${spineItem.cfiBase}!/4/1:0)`;
                  try {
                    const pctVal = book.locations.percentageFromCfi(startCfi);
                    if (pctVal != null && pctVal > 0) {
                      computedEndPct = pctVal;
                    }
                  } catch { /* invalid CFI — fall through */ }
                }
                /* Fallback: spine index ratio */
                if (computedEndPct == null) {
                  const spineIdx = spine.indexOf(spineItem);
                  computedEndPct = (spineIdx + 1) / (spine.length + 1);
                }
              } else {
                computedEndPct = (chIdx + 1) / flatToc.length;
              }
              
              console.log('[Chapter End Debug]', {
                chIdx,
                chLabel: ch.label?.trim(),
                chHref: ch.href,
                nextLabel: nextCh.label?.trim(),
                nextHref: nextCh.href,
                computedEndPct,
                currentPct: pct,
              });
              
              setChapterEndPct(computedEndPct);
            } else {
              console.log('[Chapter End Debug] Last chapter → endPct=1');
              /* Last chapter — end is 100% */
              setChapterEndPct(1);
            }
          }
        });

        /* Generate locations in the background, then update page numbers */
        book.ready.then(() => book.locations.generate(1024)).then(() => {
          if (cancelled) return;

          /* Derive word count from locations:
             each location ≈ 1024 characters of text content,
             average English word ≈ 5 chars + space ≈ 6 chars. */
          const totalLocs = book.locations.length();
          const estimatedWords = Math.round((totalLocs * 1024) / 6);
          if (estimatedWords > 0) {
            setStats((prev) => {
              const updated = setWordCount(prev, estimatedWords);
              saveStats(bookId, updated);
              return updated;
            });
          }

          /* Force page number update for the current position */
          const loc = rendition.currentLocation();
          if (loc?.start?.cfi) {
            const pg = book.locations.locationFromCfi(loc.start.cfi);
            if (pg >= 0 && totalLocs > 0) {
              setCurrentPage(pg + 1);
              setTotalPages(totalLocs);
            }
          }
        });

        /* Keyboard navigation */
        rendition.on('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') rendition.next();
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') rendition.prev();
        });
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    /* Global keyboard handler */
    const handleKey = (e) => {
      if (!renditionRef.current) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renditionRef.current.next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') renditionRef.current.prev();
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKey);
      flushPageTime();
      if (holdRef.current) clearTimeout(holdRef.current.timerId);
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (renditionRef.current) renditionRef.current.destroy();
      if (bookRef.current) bookRef.current.destroy();
    };
  }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Periodic flush (handles idle reading on same page) --------- */
  useEffect(() => {
    tickRef.current = setInterval(() => {
      const p = pageStartRef.current;
      if (!p) return;
      const elapsed = (Date.now() - p.time) / 1000;

      /* If idle timeout reached, flush capped time and stop timing */
      if (elapsed >= IDLE_TIMEOUT) {
        flushPageTime();
        /* Don't restart — user is idle. Timer resumes on next page turn. */
        return;
      }

      if (elapsed >= 2) {
        flushPageTime();
        /* Restart for the same page */
        startPageTimer(p.startPct, p.endPct);
      }
    }, TICK_INTERVAL * 5);

    return () => clearInterval(tickRef.current);
  }, [flushPageTime, startPageTimer]);

  /* ---- Pause timing when tab/window is hidden --------------------- */
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        /* Tab hidden — flush what we have and stop timing */
        flushPageTime();
      } else {
        /* Tab visible again — restart timer for current page if we have location */
        const r = renditionRef.current;
        if (r?.location) {
          const start = r.location.start?.percentage ?? 0;
          const end = r.location.end?.percentage ?? start;
          startPageTimer(start, end);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [flushPageTime, startPageTimer]);

  /* ---- Settings changes ------------------------------------------- */
  const handleSettingsChange = useCallback(
    (newSettings) => {
      setSettings(newSettings);
      saveSettings(newSettings);
      if (renditionRef.current) {
        applySettings(renditionRef.current, newSettings);
        /* Defer resize so the DOM updates padding first */
        requestAnimationFrame(() => {
          if (renditionRef.current?.manager) {
            renditionRef.current.resize();
          }
        });
      }
    },
    [],
  );

  /* ---- Navigation ------------------------------------------------- */
  const prev = () => renditionRef.current?.prev();
  const next = () => renditionRef.current?.next();

  /* ---- Toolbar visibility ----------------------------------------- */
  const [showToolbar, setShowToolbar] = useState(false);

  /* Determine nav direction from pointer position */
  const getNavAction = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pctX = x / rect.width;
    const pctY = y / rect.height;

    if (pctY > 0.88) return 'toolbar';
    if (pctX < 0.25) return 'prev';
    return 'next';
  }, []);

  const cancelHold = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current.timerId);
      holdRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e) => {
    const action = getNavAction(e);
    if (action === 'toolbar') return; // toolbar toggle only on tap

    const navFn = action === 'prev' ? prev : next;

    /* Fire once immediately (the initial tap) handled on pointerUp for
       short taps; for long-press we start after a delay */
    const HOLD_DELAY = 500;   // ms before repeat starts
    const INITIAL_INTERVAL = 200; // ms between repeats at start
    const MIN_INTERVAL = 60;  // fastest repeat speed
    const ACCEL = 0.85;       // multiplier each tick

    let interval = INITIAL_INTERVAL;

    const tick = () => {
      navFn();
      interval = Math.max(MIN_INTERVAL, interval * ACCEL);
      holdRef.current.timerId = setTimeout(tick, interval);
    };

    holdRef.current = {
      action,
      fired: false,
      timerId: setTimeout(() => {
        holdRef.current.fired = true;
        tick(); // first repeat
      }, HOLD_DELAY),
    };
  }, [getNavAction]);

  const handlePointerUp = useCallback((e) => {
    if (!holdRef.current) {
      /* Pointer down was on toolbar zone — handle as tap */
      const action = getNavAction(e);
      if (action === 'toolbar') {
        setShowToolbar((v) => !v);
      }
      return;
    }

    const wasFired = holdRef.current.fired;
    const action = holdRef.current.action;
    cancelHold();

    if (!wasFired) {
      /* Short tap — navigate once */
      setShowToolbar(false);
      if (action === 'prev') prev();
      else next();
    }
  }, [getNavAction, cancelHold]);

  const handlePointerLeave = useCallback(() => {
    cancelHold();
  }, [cancelHold]);

  /* ---- Theme class ------------------------------------------------ */
  const themeClass = `reader-theme-${settings.theme}`;

  /* Update PWA status-bar color when theme changes */
  useEffect(() => {
    setThemeColor(settings.theme);
  }, [settings.theme]);

  return (
    <div className={`reader ${themeClass}`}>
      {/* Heatmap progress bar */}
      <HeatmapBar stats={stats} currentBin={currentBin} theme={settings.theme} />

      {/* Book viewport */}
      <div className="reader-viewport">
        <div
          className="reader-content"
          style={{ padding: `${settings.marginV}px ${settings.marginH}px` }}
        >
          <div className="reader-epub" ref={viewerRef} />
        </div>
        {/* Full-screen tap/hold overlay */}
        <div
          className="reader-tap-overlay"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerLeave}
        />
      </div>

      {/* Toolbar — hidden by default, tap bottom of screen to show */}
      {showToolbar && (
        <div className="reader-toolbar">
          <div className="reader-toolbar-row">
            <button className="btn btn-sm" onClick={onClose} title="Back to library">
              ← Library
            </button>
            <span className="reader-page">
              {currentPage && totalPages
                ? `${currentPage} / ${totalPages}`
                : `${Math.round(currentPct * 100)}%`}
            </span>
            <button className="btn btn-sm" onClick={() => setShowSettings(true)}>
              ⚙ Settings
            </button>
          </div>
          <div className="reader-toolbar-row reader-toolbar-details">
            <span className="reader-chapter">{chapterTitle}</span>
            <span className="reader-times">
              {chapTimeLeft != null && (
                <span className="reader-eta" title="Est. chapter remaining">
                  +{formatTime(chapTimeLeft)}
                </span>
              )}
              {bookTimeLeft != null && (
                <span className="reader-eta" title="Est. book remaining">
                  +{formatTime(bookTimeLeft)}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {loading && <div className="reader-loading">Loading book…</div>}
      {error && <div className="reader-error">{error}</div>}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
          onDelete={() => onDelete(bookId)}
          onResetData={() => {
            onResetData(bookId);
            setStats(createBookStats(bookId));
            setCurrentPct(0);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Apply font / margin / theme settings to the rendition              */
/* ------------------------------------------------------------------ */
function applySettings(rendition, settings) {
  const fontFamily =
    settings.fontFamily && settings.fontFamily !== 'default'
      ? `${settings.fontFamily} !important`
      : 'inherit';

  /* Theme colours */
  const themeColors = {
    light: { color: '#1a1a1a !important', background: '#ffffff !important' },
    dark:  { color: '#d4d4d4 !important', background: '#1e1e1e !important' },
    sepia: { color: '#5b4636 !important', background: '#f4ecd8 !important' },
  };
  const linkColors = {
    light: '#4f46e5',
    dark:  '#818cf8',
    sepia: '#8b5e3c',
  };
  const colors = themeColors[settings.theme] || themeColors.light;
  const linkColor = linkColors[settings.theme] || linkColors.light;

  const pSpacing = `${settings.paragraphSpacing ?? 0.5}em`;
  const textAlign = `${settings.textAlign ?? 'justify'} !important`;

  /* Single merged call — epub.js themes.default() replaces, not merges */
  rendition.themes.default({
    body: {
      'font-family': fontFamily,
      'font-size': `${settings.fontSize}px !important`,
      'line-height': `${settings.lineHeight ?? 1.6} !important`,
      'text-align': textAlign,
      margin: '0 !important',
      padding: '0 !important',
      '-webkit-user-select': 'none !important',
      '-moz-user-select': 'none !important',
      'user-select': 'none !important',
      ...colors,
    },
    'body *': {
      'font-family': fontFamily,
      'font-size': 'inherit !important',
      color: colors.color,
      '-webkit-user-select': 'none !important',
      '-moz-user-select': 'none !important',
      'user-select': 'none !important',
    },
    p: {
      'margin-top': `${pSpacing} !important`,
      'margin-bottom': `${pSpacing} !important`,
      'text-align': textAlign,
    },
    'div, section, article': {
      'margin-top': `${pSpacing} !important`,
      'margin-bottom': `${pSpacing} !important`,
      'text-align': textAlign,
    },
    a: {
      color: `${linkColor} !important`,
      'text-decoration': 'underline !important',
    },
    'a:visited': {
      color: `${linkColor} !important`,
    },
    'a:link': {
      color: `${linkColor} !important`,
    },
    'body a, body a *': {
      color: `${linkColor} !important`,
    },
  });
}
