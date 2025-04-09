<script lang="ts">
    import type { PropertyDescriptor } from '$lib/common/Asset';
    import * as THREE from 'three';
    import { sceneStore } from '$lib/stores/scene';

    function handlePropertyChange(propertyName: string, value: any) {
        if ($sceneStore.selectedAsset) {
            const properties = $sceneStore.selectedAsset.getProperties();
            const property = properties.get(propertyName);
            if (property) {
                property.value = value;
                if (property.onChange) {
                    property.onChange(value);
                }
            }
        }
    }
</script>

<div class="inspector">
    {#if $sceneStore.selectedAsset}
        <h2>{$sceneStore.selectedAsset.constructor.name}</h2>
        <div class="properties">
            {#each Array.from($sceneStore.selectedAsset.getProperties().entries()) as [name, property]}
                <div class="property">
                    <label title={property.help}>{property.title}</label>
                    {#if property.type === 'float' || property.type === 'int'}
                        <input
                            type="number"
                            value={property.value}
                            min={property.min}
                            max={property.max}
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                handlePropertyChange(name, parseFloat(target.value));
                            }}
                        />
                    {:else if property.type === 'boolean'}
                        <input
                            type="checkbox"
                            checked={property.value}
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                handlePropertyChange(name, target.checked);
                            }}
                        />
                    {:else if property.type === 'color'}
                        <input
                            type="color"
                            value={property.value.getHexString()}
                            on:change={(e: Event) => {
                                const target = e.target as HTMLInputElement;
                                handlePropertyChange(name, new THREE.Color(target.value));
                            }}
                        />
                    {:else if property.type === 'vector3'}
                        <div class="vector3-input">
                            <input
                                type="number"
                                value={property.value.x}
                                on:change={(e: Event) => {
                                    const target = e.target as HTMLInputElement;
                                    const newValue = property.value.clone();
                                    newValue.x = parseFloat(target.value);
                                    handlePropertyChange(name, newValue);
                                }}
                            />
                            <input
                                type="number"
                                value={property.value.y}
                                on:change={(e: Event) => {
                                    const target = e.target as HTMLInputElement;
                                    const newValue = property.value.clone();
                                    newValue.y = parseFloat(target.value);
                                    handlePropertyChange(name, newValue);
                                }}
                            />
                            <input
                                type="number"
                                value={property.value.z}
                                on:change={(e: Event) => {
                                    const target = e.target as HTMLInputElement;
                                    const newValue = property.value.clone();
                                    newValue.z = parseFloat(target.value);
                                    handlePropertyChange(name, newValue);
                                }}
                            />
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {:else}
        <div class="no-selection">Select an object to inspect</div>
    {/if}
</div>

<style>
    .inspector {
        width: 300px;
        padding: 1rem;
        border-left: 1px solid #ddd;
        overflow-y: auto;
    }

    .properties {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .property {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .vector3-input {
        display: flex;
        gap: 0.5rem;
    }

    .vector3-input input {
        width: 60px;
    }

    .no-selection {
        color: #666;
        text-align: center;
        padding: 2rem;
    }
</style> 