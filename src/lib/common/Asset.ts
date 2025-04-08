export interface Serialisable {
}

export interface ParamCollection {
    getProperties(): Map<string, PropertyDescriptor>;
}

export interface PropertyDescriptor {
    title: string;
    help: string;
    type: 'float' | 'int' | 'boolean' | 'color' | 'vector3';
    min?: number;
    max?: number;
    defaultValue: any;
    value: any;
    onChange?: (value: any) => void;
}

export interface HierarchicalProperties {
    title: string;
    properties: Map<string, PropertyDescriptor>;
    children: HierarchicalProperties[];
}

export abstract class Asset implements ParamCollection {
    abstract getProperties(): Map<string, PropertyDescriptor>;

    /**
     * Get all properties from this asset and its children in a hierarchical structure
     * @param title The title to use for this asset's properties
     * @returns A hierarchical structure of properties
     */
    getHierarchicalProperties(title: string): HierarchicalProperties {
        const result: HierarchicalProperties = {
            title,
            properties: this.getProperties(),
            children: []
        };

        // Add Object3D properties first
        if ('getObject3D' in this) {
            const object3D = (this as any).getObject3D();
            if (object3D) {
                const object3DProps: HierarchicalProperties = {
                    title: 'Object3D',
                    properties: (this as any).getProperties(),
                    children: []
                };
                result.children.push(object3DProps);
            }
        }

        // Add Geometry properties second
        if ('getGeometry' in this) {
            const geometry = (this as any).getGeometry();
            if (geometry instanceof Asset) {
                const geometryProps = geometry.getHierarchicalProperties('Geometry');
                result.children.push(geometryProps);
            }
        }

        // Add Material properties last
        if ('getMaterial' in this) {
            const material = (this as any).getMaterial();
            if (material instanceof Asset) {
                const materialProps = material.getHierarchicalProperties('Material');
                result.children.push(materialProps);
            }
        }

        return result;
    }
}