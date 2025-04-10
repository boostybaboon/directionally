<script lang="ts">
    import { sceneStore } from '$lib/stores/scene';
    import * as THREE from 'three';
</script>

<div class="inspector">
    {#if $sceneStore.selectedAsset}
        <h2>{$sceneStore.selectedAsset.getName()}</h2>
        <div class="properties">
            {#each Array.from($sceneStore.selectedAsset.getHierarchicalProperties('Properties').properties.entries()) as [name, prop]}
                <div class="property">
                    <label>{prop.title}</label>
                    {#if prop.type === 'float' || prop.type === 'int'}
                        <input 
                            type="number" 
                            value={prop.value} 
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                prop.onChange?.(Number(target.value));
                            }}
                        />
                    {:else if prop.type === 'boolean'}
                        <input 
                            type="checkbox" 
                            checked={prop.value} 
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                prop.onChange?.(target.checked);
                            }}
                        />
                    {:else if prop.type === 'color'}
                        <input 
                            type="color" 
                            value={prop.value.getHexString()} 
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                const color = new THREE.Color(target.value);
                                prop.onChange?.(color);
                            }}
                        />
                    {:else if prop.type === 'vector3'}
                        <div class="vector-inputs">
                            <div class="vector-component">
                                <label>X</label>
                                <input 
                                    type="number" 
                                    value={prop.value.x} 
                                    on:change={(e: Event) => {
                                        const target = e.target as HTMLInputElement;
                                        const newValue = prop.value.clone();
                                        newValue.x = Number(target.value);
                                        prop.onChange?.(newValue);
                                    }}
                                />
                            </div>
                            <div class="vector-component">
                                <label>Y</label>
                                <input 
                                    type="number" 
                                    value={prop.value.y} 
                                    on:change={(e: Event) => {
                                        const target = e.target as HTMLInputElement;
                                        const newValue = prop.value.clone();
                                        newValue.y = Number(target.value);
                                        prop.onChange?.(newValue);
                                    }}
                                />
                            </div>
                            <div class="vector-component">
                                <label>Z</label>
                                <input 
                                    type="number" 
                                    value={prop.value.z} 
                                    on:change={(e: Event) => {
                                        const target = e.target as HTMLInputElement;
                                        const newValue = prop.value.clone();
                                        newValue.z = Number(target.value);
                                        prop.onChange?.(newValue);
                                    }}
                                />
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <div class="no-selection">
            <p>Select an object to inspect</p>
        </div>
    {/if}
</div>

<style>
    .inspector {
        padding: 20px;
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        overflow-y: auto;
        background-color: #f5f5f5;
    }

    h2 {
        margin: 0 0 20px 0;
        font-size: 1.2em;
        color: #333;
    }

    .properties {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .property {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .property label {
        font-size: 0.9em;
        color: #666;
    }

    .property input {
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 3px;
        width: 100%;
        box-sizing: border-box;
    }

    .vector-inputs {
        display: flex;
        gap: 10px;
        width: 100%;
    }

    .vector-component {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
    }

    .vector-component label {
        font-size: 0.8em;
        color: #666;
        text-align: center;
    }

    .vector-component input {
        width: 100%;
        text-align: center;
    }

    .no-selection {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #666;
    }
</style> 