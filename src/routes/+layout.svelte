<script lang="ts">
  import { type Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

{@render children()}

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  :global(html, body) {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #111;
    color: #ccc;
    font-family: system-ui, sans-serif;
    font-size: 13px;
  }
</style>
