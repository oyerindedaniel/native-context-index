export interface Position {
    line: number;
    column: number;
}

export interface SourceLocation {
    start: Position;
    end: Position;
}

export interface Node {
    loc: SourceLocation;
    /** @since 1.0.0 */
    anotherLoc: SourceLocation;
}
