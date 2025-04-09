import { writable } from 'svelte/store';
import type { Asset } from '$lib/common/Asset';

export const selectedAsset = writable<Asset | null>(null); 