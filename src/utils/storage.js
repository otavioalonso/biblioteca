/**
 * Storage adapter – persists book state & stats via cookies + localStorage.
 *
 * Cookies store a small pointer (bookId + position).
 * localStorage / localForage stores the heavier stats data.
 */
import Cookies from 'js-cookie';
import localforage from 'localforage';
import { createBookStats } from './readingStats';

const COOKIE_PREFIX = 'reader_';
const COOKIE_OPTS = { expires: 365, sameSite: 'Lax' };

/* ------------------------------------------------------------------ */
/*  Cookie helpers (lightweight progress)                              */
/* ------------------------------------------------------------------ */

export function saveProgressCookie(bookId, location, percentage) {
  Cookies.set(
    `${COOKIE_PREFIX}${bookId}`,
    JSON.stringify({ location, percentage, updatedAt: Date.now() }),
    COOKIE_OPTS,
  );
}

export function loadProgressCookie(bookId) {
  const raw = Cookies.get(`${COOKIE_PREFIX}${bookId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save the list of imported books (id, title, etc.).
 */
export function saveLibraryCookie(library) {
  Cookies.set(`${COOKIE_PREFIX}library`, JSON.stringify(library), COOKIE_OPTS);
}

export function loadLibraryCookie() {
  const raw = Cookies.get(`${COOKIE_PREFIX}library`);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  localForage helpers (heavy data: stats + book binary)              */
/* ------------------------------------------------------------------ */

const statsStore = localforage.createInstance({ name: 'reader', storeName: 'stats' });
const bookStore = localforage.createInstance({ name: 'reader', storeName: 'books' });
const coverStore = localforage.createInstance({ name: 'reader', storeName: 'covers' });

export async function saveStats(bookId, stats) {
  await statsStore.setItem(bookId, stats);
}

export async function loadStats(bookId) {
  const data = await statsStore.getItem(bookId);
  return data || createBookStats(bookId);
}

export async function saveBookFile(bookId, arrayBuffer) {
  await bookStore.setItem(bookId, arrayBuffer);
}

export async function loadBookFile(bookId) {
  return bookStore.getItem(bookId);
}

export async function removeBook(bookId) {
  await Promise.all([
    statsStore.removeItem(bookId),
    bookStore.removeItem(bookId),
    coverStore.removeItem(bookId),
  ]);
  Cookies.remove(`${COOKIE_PREFIX}${bookId}`);
}

export async function resetBookData(bookId) {
  await statsStore.removeItem(bookId);
  Cookies.remove(`${COOKIE_PREFIX}${bookId}`);
}

/* ------------------------------------------------------------------ */
/*  Cover helpers                                                      */
/* ------------------------------------------------------------------ */

export async function saveCover(bookId, dataUrl) {
  await coverStore.setItem(bookId, dataUrl);
}

export async function loadCover(bookId) {
  return coverStore.getItem(bookId);
}

export async function loadAllCovers() {
  const covers = {};
  await coverStore.iterate((value, key) => {
    covers[key] = value;
  });
  return covers;
}

/* ------------------------------------------------------------------ */
/*  Settings (font size, margins)                                      */
/* ------------------------------------------------------------------ */

const SETTINGS_KEY = `${COOKIE_PREFIX}settings`;

const DEFAULT_SETTINGS = {
  fontSize: 18,
  fontFamily: 'default',
  textAlign: 'justify',
  lineHeight: 1.6,
  paragraphSpacing: 0.5,
  marginH: 60,
  marginV: 8,
  theme: 'light', // 'light' | 'dark' | 'sepia'
};

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
