// Shared theme-switcher dropdown, included on every page. The actual theme
// application happens via a separate tiny inline script in each page's
// <head> (must run before first paint, so it can't live in this async file
// — otherwise there'd be a flash of the wrong theme before this loads).
const THEMES = [
  { id: '', label: 'Gothic Parchment' },
  { id: 'erdtree-haze', label: 'Erdtree Haze' },
  { id: 'erdtree-bloom', label: 'Erdtree Bloom' },
  { id: 'night-sigil', label: 'Night Sigil' },
];

function initThemeSwitcher(){
  const current = localStorage.getItem('theme') || '';
  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex; align-items:center; gap:0.3rem;';
  const select = document.createElement('select');
  select.id = 'themeSelect';
  select.style.cssText = 'background:var(--bg-raised); color:var(--parchment); border:1px solid var(--hairline); font-size:0.75rem; padding:0.3rem 0.4rem;';
  select.innerHTML = THEMES.map(t => `<option value="${t.id}" ${t.id === current ? 'selected' : ''}>${t.label}</option>`).join('');
  select.addEventListener('change', () => {
    const val = select.value;
    if(val){ document.documentElement.setAttribute('data-theme', val); localStorage.setItem('theme', val); }
    else{ document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
  });
  wrap.appendChild(select);

  const mount = document.getElementById('themeSwitcherMount');
  if(mount) mount.appendChild(wrap);
}

document.addEventListener('DOMContentLoaded', initThemeSwitcher);
