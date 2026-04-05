/**
 * Two parents that share a member with the same short name ("shared").
 * When a class AND an interface both named "Composite" each extend one of
 * these parents, the flattening step must merge their heritage before
 * processing — otherwise it creates duplicate synthetic IDs.
 *
 * Flattening note: `Trait.shared` and `Base.prototype.shared` share the leaf name
 * `shared`, so heritage emits one row `Composite.shared` (type-side) whose
 * `inheritedFromSources` lists both parent symbol ids (sorted). `baseOnly` exists only on
 * `Base`, so you still get `Composite.prototype.baseOnly` (value-side). There is intentionally no
 * `Composite.prototype.shared` row in addition to `Composite.shared`.
 */

export declare class Base {
  shared(): void;
  baseOnly(): void;
}

export declare interface Trait {
  shared(): void;
  traitOnly(): void;
}

/** Interface declaration — extends Trait. */
export declare interface Composite extends Trait {
  compositeFunc(): void;
}

/** Class declaration — same name, extends Base. */
export declare class Composite extends Base {
  ownProp: number;
}

/**
 * Type-position `Composite`: merged symbol resolution shows up in this symbol's `dependencies[]`.
 * (`Composite.shared` is a single flattened row; `inheritedFromSources` includes both
 * `Trait.shared` and `Base.prototype.shared`.)
 */
export declare function bridgeComposite(instance: Composite): Composite;

/**
 * Type alias to `Composite`. Dependency IDs still include **both** merged declarations
 * (`Composite` interface and `Composite#2` class) — same as value+type uses.
 */
export type CompositeTypeAlias = Composite;
