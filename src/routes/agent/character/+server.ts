import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { resolveCharacterSpec, validateCharacterSpec, type CharacterSpec } from '../../../core/character/characterSpec.js';
import { semanticToRingParams, semanticToBoneParams } from '../../../core/character/semanticParams.js';

/**
 * Level-0 character API (HP-10). Accepts a `CharacterSpec` and returns the full
 * set of resolved inputs a client needs to build the humanoid. Natural-language
 * → spec is the AI agent's job, not this endpoint's.
 */
export const POST: RequestHandler = async ({ request }) => {
  const spec: CharacterSpec = await request.json().catch(() => ({}));
  const resolved = resolveCharacterSpec(spec);

  return json({
    spec: validateCharacterSpec(spec),
    semantic: resolved.semantic,
    skinColor: resolved.skinColor,
    hairColor: resolved.faceParams.hairColor,
    eyeColor: resolved.faceParams.irisColor,
    outfit: resolved.outfit,
    heightScale: resolved.heightScale,
    ringParams: semanticToRingParams(resolved.semantic),
    boneParams: semanticToBoneParams(resolved.semantic),
  });
};
