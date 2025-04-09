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
    protected _name: string;

    constructor(name: string = 'Unnamed Asset') {
        this._name = name;
    }

    getName(): string {
        return this._name;
    }

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

        // Add geometry properties if this asset has geometry
        if ('getGeometry' in this) {
            const geometry = (this as any).getGeometry();
            if (geometry && geometry instanceof Asset) {
                result.children.push(geometry.getHierarchicalProperties('Geometry'));
            }
        }

        // Add material properties if this asset has material
        if ('getMaterial' in this) {
            const material = (this as any).getMaterial();
            if (material && material instanceof Asset) {
                result.children.push(material.getHierarchicalProperties('Material'));
            }
        }

        return result;
    }
}