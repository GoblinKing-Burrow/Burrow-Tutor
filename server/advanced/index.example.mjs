import { registerCoreCapabilityRoutes } from './core-capabilities.mjs';
import { registerExternalAgentTurnRoutes } from './external-agent-turns.mjs';
import { registerDiagnosticAdapter, registerAdvancedTools, clearAdvancedToolState } from './diagnostics-tools.mjs';
import { registerPersistentDataRoutes } from './persistent-data.mjs';

/**
 * Standalone Advanced capability-lab entrypoint.
 *
 * Tutor's installed reference mod deliberately keeps server/index.mjs small for
 * the Beginner path. Copy this entrypoint and the advanced modules into a new
 * mod when you want a runnable laboratory for the wider ordinary-mod surface.
 */
export function activate(context) {
  registerCoreCapabilityRoutes(context);
  registerExternalAgentTurnRoutes(context);
  registerPersistentDataRoutes(context);
  registerDiagnosticAdapter(context);
  registerAdvancedTools(context);
  context.logger.info('Burrow Tutor Advanced examples activated');
  return () => {
    clearAdvancedToolState();
    context.logger.info('Burrow Tutor Advanced examples stopped');
  };
}
