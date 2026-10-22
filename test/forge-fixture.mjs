// In-memory paid-dispatch stand-in. Integration tests still use Core's real
// createModCapabilities projection/ownership checks and forked mod host RPC.
export function forgeFixture() {
  const jobs = new Map();
  const creates = [];
  let selection = { connectionId: 'private-connection', modelId: 'private-model' };
  let available = true;
  const forge = {
    catalog: async () => ({ models: [{ connectionId: 'private-connection', modelId: 'private-model', kind: 'image', available }] }),
    selections: async () => ({ image: selection }),
    async create(input, options) {
      creates.push(structuredClone({ input, options }));
      const prior = [...jobs.values()].find((job) => job.idempotencyKey === input.idempotencyKey);
      if (prior) return { job: prior, replayed: true };
      const job = {
        id: `job-${jobs.size + 1}`, kind: 'image', modOwnerId: options.ownerModId,
        status: 'queued', prompt: input.prompt, idempotencyKey: input.idempotencyKey,
        connectionId: 'private-connection', modelId: 'private-model',
        createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T00:00:00.000Z',
        error: null, artifacts: [],
      };
      jobs.set(job.id, job);
      return { job, replayed: false };
    },
    async get(id) {
      const job = jobs.get(id);
      if (!job) throw Error('forge_job_not_found');
      return structuredClone(job);
    },
    public: (job) => ({ ...structuredClone(job), artifacts: job.artifacts.map((artifact) => ({
      ...artifact, previewUrl: `/api/forge/jobs/${job.id}/artifacts/${artifact.id}`,
    })) }),
  };
  return { forge, creates, jobs, setSelection: (value) => { selection = value; }, setAvailable: (value) => { available = value; } };
}
