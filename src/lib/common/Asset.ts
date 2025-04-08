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

        // Get properties from child assets if they exist
        if ('getGeometry' in this) {
            const geometry = (this as any).getGeometry();
            if (geometry instanceof Asset) {
                result.children.push(geometry.getHierarchicalProperties('Geometry'));
            }
        }

        if ('getMaterial' in this) {
            const material = (this as any).getMaterial();
            if (material instanceof Asset) {
                result.children.push(material.getHierarchicalProperties('Material'));
            }
        }

        return result;
    }
}