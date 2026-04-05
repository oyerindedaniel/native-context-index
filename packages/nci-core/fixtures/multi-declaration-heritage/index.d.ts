/**
 * Two parents that share a member with the same short name ("shared").
 * When a class AND an interface both named "Composite" each extend one of
 * these parents, the flattening step must merge their heritage before
 * processing — otherwise it creates duplicate synthetic IDs.
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
