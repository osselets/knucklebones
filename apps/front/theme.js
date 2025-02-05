/*
  allow to quickly style the index.html before the full app loads, and avoid
  flashes during refreshes. This file should be imported right after `body`.
*/
const shouldUseDarkTheme =
  localStorage.theme === 'dark' ||
  (localStorage.theme === 'default' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches)

if (shouldUseDarkTheme) {
  document.body.classList.add('dark')
}
