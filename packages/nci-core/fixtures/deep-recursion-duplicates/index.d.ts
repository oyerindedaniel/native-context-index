/**
 * Stores metadata about a schema definition.
 */
export interface Annotations {
  readonly title: string;
}

/**
 * A generalized schema that can be nested.
 */
export interface Schema<A, I, R> {
  readonly AST: string;
  readonly Type: A;
  readonly annotations: Annotations;
}

/**
 * The unique identifier for result-based schemas.
 */
export declare const symbolWithResult: unique symbol;

/**
 * Represents a schema with success and failure branches.
 * This structure tests deep recursive expansion of named types
 * within computed property keys.
 */
export interface WithResult<Success, Failure> {
  readonly [symbolWithResult]: {
    readonly success: Schema<Success, string, never> & { _tag: "Success" };
    readonly failure: Schema<Failure, string, never> & { _tag: "Failure" };
  };
}
