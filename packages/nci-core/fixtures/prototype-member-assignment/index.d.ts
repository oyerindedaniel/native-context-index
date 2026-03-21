/** 
 * Generic Base Node
 * @since 1.0.0 
 */
export declare class BaseNode { }

/** 
 * Ad-hoc Prototype Assignment (Target: Property)
 * @since 1.1.0 
 */
BaseNode.prototype.isLegacy = true;

/** 
 * Ad-hoc Prototype Assignment (Target: Method)
 * @since 1.2.0 
 */
BaseNode.prototype.upgrade = function(): void { };
