export declare class AccessorTest {
    /** @since 1.0.0 */
    get readOnlyProp(): string;
    /** @since 1.0.0 */
    set writeOnlyProp(value: number);
    /** @since 1.1.0 */
    get readWriteProp(): boolean;
    set readWriteProp(value: boolean);
}

export interface IAccessorTest {
    get prop(): string;
}
