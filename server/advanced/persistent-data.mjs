import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_NOTE_BYTES = 32_768;
let writes = Promise.resolve();
const response = (status, body) => ({ status, headers: { 'cache-control': 'no-store' }, body });
function requireOperator(request) {
  if (request?.auth?.enabled !== false && request?.auth?.authenticated !== true) throw Object.assign(new Error('operator_authentication_required'), { statusCode: 401 });
}
function notePath(modId) {
  const runtimeRoot = process.env.BURROW_RUNTIME_ROOT;
  if (!runtimeRoot || !path.isAbsolute(runtimeRoot)) throw new Error('mod_data_root_unavailable');
  return path.join(runtimeRoot, 'mods', 'mod-data', modId, 'advanced-note.json');
}
async function readNote(filePath) {
  try {
    const value = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return typeof value?.text === 'string' && typeof value?.updatedAt === 'string' ? value : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** A fixed-path, atomic mod-data example. Mods still own schema, migration,
 * locking, backup, encryption, retention, and explicit deletion policy. */
export function registerPersistentDataRoutes(context) {
  context.api.get('/advanced/data/note', async (request) => {
    try { requireOperator(request); return response(200, { ok: true, note: await readNote(notePath(context.id)) }); }
    catch (error) { return response(Number(error?.statusCode) || 500, { ok: false, error: Number(error?.statusCode) ? error.message : 'mod_data_read_failed' }); }
  });
  context.api.put('/advanced/data/note', async (request) => {
    try {
      requireOperator(request);
      if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).some((key) => key !== 'text') || typeof request.body.text !== 'string' || Buffer.byteLength(request.body.text) > MAX_NOTE_BYTES) throw Object.assign(new Error('mod_data_input_invalid'), { statusCode: 400 });
      const note = { text: request.body.text, updatedAt: new Date().toISOString() };
      writes = writes.catch(() => {}).then(async () => {
        const filePath = notePath(context.id);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const temporary = `${filePath}.${process.pid}.tmp`;
        await fs.writeFile(temporary, `${JSON.stringify(note, null, 2)}\n`, { mode: 0o600 });
        await fs.rename(temporary, filePath);
      });
      await writes;
      return response(200, { ok: true, note });
    } catch (error) { return response(Number(error?.statusCode) || 500, { ok: false, error: Number(error?.statusCode) ? error.message : 'mod_data_write_failed' }); }
  });
}
