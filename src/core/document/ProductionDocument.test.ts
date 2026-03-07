import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionDocument } from './ProductionDocument';
import type { Command } from './Command';
import type { StoredProduction } from '../storage/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduction(overrides?: Partial<StoredProduction>): StoredProduction {
  return {
    id: 'test-id',
    name: 'Test Production',
    createdAt: 1000,
    modifiedAt: 1000,
    script: [],
    ...overrides,
  };
}

/** Trivial command: appends a tag to the production name. */
function appendCmd(tag: string): Command {
  return {
    label: `Append "${tag}"`,
    execute(doc) { return { ...doc, name: doc.name + tag, modifiedAt: doc.modifiedAt + 1 }; },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDoc(initial?: Partial<StoredProduction>) {
  const onChange = vi.fn();
  const save = vi.fn();
  const doc = new ProductionDocument(makeProduction(initial), onChange, save);
  return { doc, onChange, save };
}

// ── execute ───────────────────────────────────────────────────────────────────

describe('execute', () => {
  it('applies the command and updates current', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    expect(doc.current.name).toBe('Test Production-A');
  });

  it('calls onChange with the new document', () => {
    const { doc, onChange } = makeDoc();
    doc.execute(appendCmd('-A'));
    expect(onChange).toHaveBeenCalledWith(doc.current);
  });

  it('calls the save function with the new document', () => {
    const { doc, save } = makeDoc();
    doc.execute(appendCmd('-A'));
    expect(save).toHaveBeenCalledWith(doc.current);
  });

  it('stacks multiple commands', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    expect(doc.current.name).toBe('Test Production-A-B');
  });

  it('truncates redo branch when executed after undo', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    doc.undo();
    doc.execute(appendCmd('-C'));
    expect(doc.current.name).toBe('Test Production-A-C');
    expect(doc.canRedo).toBe(false);
  });
});

// ── undo ─────────────────────────────────────────────────────────────────────

describe('undo', () => {
  it('restores the previous document state', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.undo();
    expect(doc.current.name).toBe('Test Production');
  });

  it('calls onChange with the restored document', () => {
    const { doc, onChange } = makeDoc();
    const initial = doc.current;
    doc.execute(appendCmd('-A'));
    onChange.mockClear();
    doc.undo();
    expect(onChange).toHaveBeenCalledWith(initial);
  });

  it('calls save with the restored document', () => {
    const { doc, save } = makeDoc();
    const initial = doc.current;
    doc.execute(appendCmd('-A'));
    save.mockClear();
    doc.undo();
    expect(save).toHaveBeenCalledWith(initial);
  });

  it('does nothing when there is nothing to undo', () => {
    const { doc, onChange } = makeDoc();
    doc.undo();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('can undo multiple steps', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    doc.undo();
    doc.undo();
    expect(doc.current.name).toBe('Test Production');
  });
});

// ── redo ─────────────────────────────────────────────────────────────────────

describe('redo', () => {
  it('re-applies the undone command', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.undo();
    doc.redo();
    expect(doc.current.name).toBe('Test Production-A');
  });

  it('calls onChange with the redone document', () => {
    const { doc, onChange } = makeDoc();
    doc.execute(appendCmd('-A'));
    const afterA = doc.current;
    doc.undo();
    onChange.mockClear();
    doc.redo();
    expect(onChange).toHaveBeenCalledWith(afterA);
  });

  it('does nothing when there is nothing to redo', () => {
    const { doc, onChange } = makeDoc();
    doc.redo();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('can redo multiple steps', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    doc.undo();
    doc.undo();
    doc.redo();
    doc.redo();
    expect(doc.current.name).toBe('Test Production-A-B');
  });
});

// ── canUndo / canRedo ─────────────────────────────────────────────────────────

describe('canUndo / canRedo', () => {
  it('canUndo is false initially', () => {
    const { doc } = makeDoc();
    expect(doc.canUndo).toBe(false);
  });

  it('canRedo is false initially', () => {
    const { doc } = makeDoc();
    expect(doc.canRedo).toBe(false);
  });

  it('canUndo is true after execute', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    expect(doc.canUndo).toBe(true);
  });

  it('canRedo is true after undo', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.undo();
    expect(doc.canRedo).toBe(true);
  });

  it('canUndo is false after undoing all steps', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.undo();
    expect(doc.canUndo).toBe(false);
  });

  it('canRedo is false after redo exhausted', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.undo();
    doc.redo();
    expect(doc.canRedo).toBe(false);
  });
});

// ── history ───────────────────────────────────────────────────────────────────

describe('history', () => {
  it('records command labels in order', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    expect(doc.history).toEqual(['Append "-A"', 'Append "-B"']);
  });

  it('truncates labels when redo branch is discarded', () => {
    const { doc } = makeDoc();
    doc.execute(appendCmd('-A'));
    doc.execute(appendCmd('-B'));
    doc.undo();
    doc.execute(appendCmd('-C'));
    expect(doc.history).toEqual(['Append "-A"', 'Append "-C"']);
  });
});
