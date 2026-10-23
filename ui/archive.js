function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'className') node.className = value;
    else if (name === 'text') node.textContent = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}
function message(error) { return error instanceof Error && error.message ? error.message : 'Could not load the Archive example.'; }

/** Archive is remounted by Core when date changes. Keep state local and abort
 * in-flight work during unmount rather than assuming update() will be called. */
export function mountArchive({ root, api, date }) {
  const controller = new AbortController();
  let mounted = true;
  const state = el('p', { role: 'status', 'aria-live': 'polite', text: 'Loading example jobs…' });
  const list = el('ul', { className: 'settings-list' });
  const section = el('section', { className: 'setting-section', 'aria-labelledby': 'reference-archive-heading' },
    el('h2', { id: 'reference-archive-heading', text: 'Tutor jobs' }),
    el('p', { className: 'settings-description', text: date ? `Read-only jobs for ${date}.` : 'Read-only jobs for all dates.' }),
    state, list);
  root.replaceChildren(section);
  void (async () => {
    try {
      const query = new URLSearchParams({ limit: '25', ...(date ? { date } : {}) });
      // The reference backend ignores date today; a real Archive product owns
      // its date/cursor protocol. Query support itself is supplied by scoped api.
      const page = await api(`/advanced/scheduler/jobs?${query}`, { signal: controller.signal });
      if (!mounted) return;
      if (!page?.ok || !Array.isArray(page.jobs)) throw new Error('The mod returned an invalid job page.');
      list.replaceChildren(...page.jobs.map((job) => el('li', {}, el('strong', { text: job.name || job.id }), document.createTextNode(` — ${job.enabled ? 'enabled' : 'disabled'}`))));
      state.textContent = page.jobs.length ? `${page.jobs.length} job${page.jobs.length === 1 ? '' : 's'} shown.` : 'No jobs matched this view.';
    } catch (error) {
      if (!mounted || controller.signal.aborted) return;
      state.setAttribute('role', 'alert');
      state.className = 'settings-request-error';
      state.textContent = message(error);
    }
  })();
  return {
    unmount() {
      mounted = false;
      controller.abort();
      root.replaceChildren();
    },
  };
}
