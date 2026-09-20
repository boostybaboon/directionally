<script lang="ts">
  import { tick } from 'svelte';
  import { planEditTurn, applyEditTurn, isEmptyDiff } from './agentTurn.js';
  import type { EditTurn } from './agentTurn.js';
  import type { CartoonSketcher } from '../core/sketcher/CartoonSketcher.js';
  import type { SketcherDocument } from '../core/sketcher/SketcherDocument.js';

  interface Props {
    /**
     * The live session: the sketcher to read (never cached, so a draft is always what is on screen)
     * and the undo stack the accepted turn executes through, so one turn is one undo.
     */
    session: { sketcher: CartoonSketcher; document: SketcherDocument };
    /** Called after a turn lands, for whatever the page keeps in step with the session. */
    onapplied?: () => void;
  }

  let { session, onapplied }: Props = $props();
  const sketcher = $derived(session.sketcher);
  const document = $derived(session.document);

  type LoggedTurn = {
    instruction: string;
    /** A planned turn awaiting a decision, or null when the turn failed. */
    plan: EditTurn | null;
    error: string | null;
    applied: boolean;
    discarded: boolean;
  };

  let turns = $state<LoggedTurn[]>([]);
  let instruction = $state('');
  let busy = $state(false);
  let logEnd: HTMLDivElement | undefined = $state();

  /** Instructions already sent, oldest first — the model's record of the conversation. */
  const history = $derived(turns.map((t) => t.instruction));
  const canSend = $derived(instruction.trim().length > 0 && !busy);

  async function send(): Promise<void> {
    const text = instruction.trim();
    if (text === '' || busy) return;

    instruction = '';
    busy = true;
    const result = await planEditTurn(sketcher, text, history);
    busy = false;

    turns = [
      ...turns,
      result.ok
        ? { instruction: text, plan: result.turn, error: null, applied: false, discarded: false }
        : { instruction: text, plan: null, error: result.error, applied: false, discarded: false },
    ];
    // The newest turn lands at the end of the log; that is what should be in view.
    await tick();
    logEnd?.scrollIntoView({ block: 'end' });
  }

  function apply(index: number): void {
    const turn = turns[index];
    if (turn.plan === null || turn.applied || turn.discarded) return;
    document.execute(applyEditTurn(sketcher, turn.plan));
    turns = turns.map((t, i) => (i === index ? { ...t, applied: true } : t));
    onapplied?.();
  }

  function discard(index: number): void {
    turns = turns.map((t, i) => (i === index ? { ...t, discarded: true } : t));
  }
</script>

<div class="agent-chat">
  <div class="chat-log">
    {#if turns.length === 0}
      <p class="chat-empty">
        Describe a change to this set — "make the room twice as long", "three chairs along the back
        wall". Each answer arrives as a diff you accept or discard.
      </p>
    {/if}

    {#each turns as turn, index (index)}
      <div class="chat-turn">
        <p class="chat-instruction">{turn.instruction}</p>

        {#if turn.error !== null}
          <p class="chat-error">{turn.error}</p>
        {:else if turn.plan !== null}
          <div class="chat-plan" class:applied={turn.applied} class:discarded={turn.discarded}>
            {#if isEmptyDiff(turn.plan.diff)}
              <p class="chat-summary">No change.</p>
            {:else}
              <ul class="chat-summary">
                {#each turn.plan.summary as line (line)}
                  <li>{line}</li>
                {/each}
              </ul>
              {#if turn.applied}
                <p class="chat-state">Applied — undo takes it back in one step.</p>
              {:else if turn.discarded}
                <p class="chat-state">Discarded.</p>
              {:else}
                <div class="chat-actions">
                  <button class="chat-apply" onclick={() => apply(index)}>Apply</button>
                  <button class="chat-discard" onclick={() => discard(index)}>Discard</button>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if busy}
      <p class="chat-thinking">Thinking…</p>
    {/if}
    <div bind:this={logEnd}></div>
  </div>

  <form class="chat-form" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <textarea
      bind:value={instruction}
      placeholder="What should change?"
      rows="2"
      disabled={busy}
      onkeydown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void send();
        }
      }}
    ></textarea>
    <button type="submit" disabled={!canSend}>Send</button>

<style>
  .agent-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .chat-log {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .chat-empty {
    margin: 0;
    color: #8080a8;
    font-size: 12px;
    line-height: 1.5;
  }

  .chat-turn {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-instruction {
    margin: 0;
    align-self: flex-end;
    max-width: 90%;
    background: #3a3a6a;
    color: #e0e0ff;
    border-radius: 8px 8px 2px 8px;
    padding: 6px 9px;
    font-size: 12px;
    line-height: 1.4;
  }

  .chat-plan {
    border: 1px solid #2a2a4a;
    border-radius: 8px;
    background: #12122a;
    padding: 8px 10px;
  }

  .chat-plan.applied {
    border-color: #4a9eff;
  }

  .chat-plan.discarded {
    opacity: 0.5;
  }

  .chat-summary {
    margin: 0;
    padding-left: 16px;
    color: #d0d0f0;
    font-size: 12px;
    line-height: 1.6;
  }

  .chat-state {
    margin: 6px 0 0;
    color: #8080a8;
    font-size: 11px;
  }

  .chat-error {
    margin: 0;
    color: #e06666;
    font-size: 12px;
    line-height: 1.5;
  }

  .chat-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }

  .chat-apply,
  .chat-discard {
    background: #2a2a4a;
    color: #e0e0f0;
    border: 1px solid #3a3a6a;
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .chat-apply {
    background: #3a3a6a;
    color: #e0e0ff;
  }

  .chat-apply:hover,
  .chat-discard:hover {
    border-color: #5555a0;
  }

  .chat-thinking {
    margin: 0;
    color: #8080a8;
    font-size: 12px;
  }

  .chat-form {
    border-top: 1px solid #2a2a4a;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chat-form textarea {
    background: #0f0f1a;
    color: #e0e0f0;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 6px 8px;
    font-family: inherit;
    font-size: 12px;
    resize: vertical;
  }

  .chat-form textarea:focus {
    outline: none;
    border-color: #5555a0;
  }

  .chat-form button {
    align-self: flex-end;
    background: #3a3a6a;
    color: #e0e0ff;
    border: 1px solid #5555a0;
    border-radius: 6px;
    padding: 4px 14px;
    font-size: 12px;
    cursor: pointer;
  }

  .chat-form button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>

  </form>
</div>
