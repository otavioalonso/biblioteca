/**
 * Update the <meta name="theme-color"> tag to match the app's current theme.
 * This controls the browser / PWA status-bar / title-bar color.
 */

const THEME_COLORS = {
  light: '#ffffff',
  dark:  '#1e1e1e',
  sepia: '#f4ecd8',
  // Library uses the base CSS dark background
  'library-dark': '#16171d',
  'library-light': '#ffffff',
};

export default function setThemeColor(theme) {
  const color = THEME_COLORS[theme] || THEME_COLORS.light;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}
