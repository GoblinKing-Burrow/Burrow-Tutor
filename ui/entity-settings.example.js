// Alternative imperative Settings module; declare this as ui.settings when copied.
export const settingsSections = [{ id: 'residents', label: 'Residents', layout: 'form-wide' }];
export function mountSettings({ primary, agents, setEntitySelector }) {
  let selectedId = agents.find(agent => agent.enabled)?.id || '';
  const render = () => {
    const text = document.createElement('p');
    text.textContent = selectedId ? `Selected identity: ${selectedId}` : 'No enabled identities';
    primary.replaceChildren(text);
    setEntitySelector({ label: 'Residents', items: agents.filter(a => a.enabled).map(a => ({ id: a.id, label: a.name })), selectedId,
      onSelect(id) {
        if (!agents.some(a => a.enabled && a.id === id)) return;
        selectedId = id;
        render();
      } });
  };
  render();
  return () => { setEntitySelector(null); primary.clear(); };
}
