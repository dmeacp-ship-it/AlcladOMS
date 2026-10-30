try {
  var d = document.documentElement;
  var t = localStorage.theme;
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
    d.dataset.theme = 'dark';
  }
  var s = localStorage.sb || (localStorage.sb_collapsed === 'true' ? 'col' : '');
  if (s) d.dataset.sb = s;
} catch (e) {}
try {
  if (/[?&]embed=1/.test(location.search)) {
    document.documentElement.classList.add('embed');
  }
} catch (e) {}
