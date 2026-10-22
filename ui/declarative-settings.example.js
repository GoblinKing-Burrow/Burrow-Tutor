// Standalone advanced example. To use this Core-rendered form instead of
// mountSettings, export these names from your declared ui.settings module.
export async function createSettingsContribution({ api, agents }) {
  const status = await api('/status');
  return {
    sections: [{
      id: 'declarative-example',
      label: 'Declarative example',
      description: 'Core renders this read-only activity view and its accessibility structure.',
      layout: 'activity',
      items: [
        { id: 'greeting', label: 'Current greeting', detail: status.greeting || '(not configured)' },
        { id: 'agents', label: 'Visible agents', meta: String(agents.length), detail: 'The factory receives a bounded host-supplied agent inventory.' },
      ],
      actions: [{ id: 'acknowledge', label: 'Acknowledge' }],
    }],
  };
}

export async function handleSettingsAction(actionId, values) {
  if (actionId !== 'acknowledge' || !values || typeof values !== 'object') throw new Error('unknown_settings_action');
  // Actions that mutate product state should call a scoped API owned by that
  // product. Tutor's imperative Beginner module already demonstrates mutation;
  // this standalone example keeps the declarative action intentionally inert.
}
