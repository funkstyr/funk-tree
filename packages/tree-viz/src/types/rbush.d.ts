declare module "rbush" {
  interface BBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }

  class RBush<T extends BBox = BBox> {
    constructor(maxEntries?: number);
    insert(item: T): RBush<T>;
    load(items: T[]): RBush<T>;
    remove(item: T, equals?: (a: T, b: T) => boolean): RBush<T>;
    clear(): RBush<T>;
    search(bbox: BBox): T[];
    collides(bbox: BBox): boolean;
    all(): T[];
    toJSON(): unknown;
    fromJSON(data: unknown): RBush<T>;
  }

  export default RBush;
}
