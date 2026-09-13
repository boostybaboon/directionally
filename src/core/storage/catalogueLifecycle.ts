import * as OPFSCatalogueStore from './OPFSCatalogueStore.js';
import * as SketcherAssemblyStore from './SketcherAssemblyStore.js';

/**
 * Delete lifecycle across the two stores (ROADMAP.md "persistence interaction").
 *
 * A catalogue entry is the *published* asset; a `SketcherAssemblyStore` entry is
 * its *editable source*, linked via `sourceAssemblyId`. Deleting either side
 * should not leave the other as a zombie, so both delete helpers cascade and
 * clear the Sketcher's "last opened assembly" pointer when it points at the
 * removed source.
 */

function clearLastOpenedAssembly(assemblyId: string): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('sketcher-assembly-id') === assemblyId) {
    localStorage.removeItem('sketcher-assembly-id');
  }
}

/**
 * Delete a catalogue entry, cascading to its backing assembly (if any).
 */
export async function deleteCatalogueEntry(id: string): Promise<void> {
  const sourceAssemblyId = await OPFSCatalogueStore.sourceAssemblyIdOf(id);
  await OPFSCatalogueStore.remove(id);
  if (sourceAssemblyId) {
    await SketcherAssemblyStore.remove(sourceAssemblyId);
    clearLastOpenedAssembly(sourceAssemblyId);
  }
}

/**
 * Delete an editable assembly, cascading to any published catalogue entry
 * backed by it (if any).
 */
export async function deleteAssemblyAndEntry(assemblyId: string): Promise<void> {
  await SketcherAssemblyStore.remove(assemblyId);
  const entry = await OPFSCatalogueStore.findByAssemblyId(assemblyId);
  if (entry) await OPFSCatalogueStore.remove(entry.id);
  clearLastOpenedAssembly(assemblyId);
}
