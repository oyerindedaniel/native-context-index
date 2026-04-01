export declare enum AST_NODE_TYPES {
    AccessorProperty = "AccessorProperty",
    ArrayExpression = "ArrayExpression",
}

export declare interface BaseNode {
    type: AST_NODE_TYPES;
    range: [number, number];
}
