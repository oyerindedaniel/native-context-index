/** @since 1.0.0 */
export declare class BaseNode {
  /** @since 1.0.0 */
  baseProp: string;
  /** @since 1.0.0 */
  commonMethod(): void;
}

/** @since 2.0.0 */
export declare class MiddleNode extends BaseNode {
  /** @since 2.0.0 */
  middleProp: number;
  /** @since 2.1.0 */
  commonMethod(): void; // Override
}

/** @since 3.0.0 */
export declare class LeafNode extends MiddleNode {
  /** @since 3.0.0 */
  leafProp: boolean;
}

/** @since 1.0.0 */
export interface BaseInterface {
    baseFunc(): void;
}

/** @since 2.0.0 */
export interface DerivedInterface extends BaseInterface {
    derivedFunc(): void;
}
