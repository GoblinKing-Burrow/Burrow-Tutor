/** Standalone opt-in lab; never creates an agent or dispatches a model at activation. */
export async function activate(context) {
  context.agents.context.register(async ({ agentId, sessionId }, { signal }) => {
    signal.throwIfAborted();
    return {
      profileFiles: [{ name: 'SOUL.md', content: 'You are a Tutor demonstration resident. Explain uncertainty honestly.' }],
      context: [{ name: 'lesson', content: `Current identity: ${agentId}; logical conversation: ${sessionId}.` }],
    };
  });
  context.agents.context.registerShared((_input, { signal }) => {
    signal.throwIfAborted();
    return { context: [{ name: 'INTERACTION.md', content: 'Distinguish observations from conclusions. This guidance grants no tools or permissions.' }] };
  });

  // Advisory wakes may repeat/overlap. Only checkpoint metadata; no follow-on
  // dispatch or external effect is claimed atomic with this settings write.
  let tail = Promise.resolve();
  function catchUp() {
    const work = tail.then(async () => {
      let cursor = await context.settings.get('native-run-cursor', null);
      for (;;) {
        const page = await context.agents.runs.list({ cursor, limit: 100 });
        if (page.events.length) {
          cursor = page.events.at(-1).cursor;
          await context.settings.set('native-run-cursor', cursor);
        }
        if (!page.hasMore) break;
      }
    });
    tail = work.catch(() => {}); // a failed wake must not poison later catch-up
    return work;
  }
  context.agents.runs.onCompleted(() => catchUp());
  const json = (status, body) => ({ status, headers: { 'cache-control': 'no-store' }, body });
  const route = handler => async request => {
    if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) return json(401, { error: 'operator_authentication_required' });
    try { return json(200, await handler(request)); }
    catch { return json(400, { error: 'native_lab_request_failed' }); }
  };
  context.api.get('/advanced/native', route(async () => ({
    owned: await context.agents.owned.list(),
    directory: await context.agents.list({ includeHidden: true }),
    activity: await context.agents.runs.activity(),
    cursor: await context.settings.get('native-run-cursor', null),
  })));
  // Core validates exact closed create/update payloads. No arbitrary operation
  // names, owner, file path, provider, or private Core imports enter this lab.
  context.api.post('/advanced/native', route(r => context.agents.owned.create(r.body)));
  context.api.get('/advanced/native/:agentId', route(r => context.agents.owned.read(r.params.agentId)));
  context.api.patch('/advanced/native/:agentId', route(r => context.agents.owned.update(r.params.agentId, r.body)));
  for (const [prefix, api] of [
    ['/advanced/native/:agentId/portrait', context.agents.owned.referenceImages],
    ['/advanced/references/:key', context.forge.references],
  ]) {
    const key = r => r.params.agentId ?? r.params.key;
    context.api.get(prefix, route(r => api.get(key(r))));
    context.api.put(prefix, route(r => api.put(key(r), r.body)));
    context.api.delete(prefix, route(r => api.remove(key(r))));
  }
  await catchUp();
  return () => tail;
}
