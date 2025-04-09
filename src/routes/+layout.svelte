<script lang="ts">
    import '$lib/app.css';
</script>

<div class="app">
    <slot />
</div>

<style>
    .app {
        height: 100vh;
        width: 100vw;
        display: flex;
    }
</style> 