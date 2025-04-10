<script lang="ts">
    import '$lib/app.css';
</script>

<div class="layout">
    <header>
        <h1>Directionally</h1>
    </header>
    <slot />
</div>

<style>
    :global(html, body) {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    .layout {
        display: flex;
        flex-direction: column;
        height: 100vh;
        width: 100vw;
    }

    header {
        height: 60px;
        background-color: #333;
        color: white;
        display: flex;
        align-items: center;
        padding: 0 20px;
        flex-shrink: 0;
    }
</style> 