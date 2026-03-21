/** 
 * Service Node with both JSDoc and Decorator Metadata
 * @since 1.0.0
 */
@injectable
@route("/api/v1/service")
export declare class ServiceNode {
    /** 
     * Decorated Method
     * @since 2.0.0 
     */
    @authenticated
    execute(): void;
}
