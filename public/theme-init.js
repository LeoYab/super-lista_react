// Aplica el tema guardado antes del primer pintado para evitar un parpadeo.
// Es un archivo aparte porque la CSP de vercel.json (script-src 'self') bloquea scripts inline.
(function () {
  try {
    var saved = localStorage.getItem('superlista_theme');
    var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
