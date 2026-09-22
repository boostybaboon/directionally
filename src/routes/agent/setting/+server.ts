import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import {
  resolveSettingSpec,
  validateSettingSpec,
  type SettingSpec,
} from '../../../core/setting/settingSpec.js';

/**
 * Level-0 setting API. Accepts a `SettingSpec` (optionally just `{ name }` to
 * hit a recipe) and returns the resolved scene — `SetPiece[]` + lights +
 * environment + any refs that didn't resolve. Natural-language → spec is the
 * AI agent's job, not this endpoint's.
 */
export const POST: RequestHandler = async ({ request }) => {
  const spec: SettingSpec = await request.json().catch(() => ({}));
  const resolved = resolveSettingSpec(spec);

  return json({
    spec: validateSettingSpec(spec),
    ...resolved,
  });
};
