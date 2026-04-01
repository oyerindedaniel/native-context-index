import { AST_NODE_TYPES, BaseNode } from './base';

export declare interface ParserServices {
    esTreeNodeToTSNodeMap: Map<string, string>;
}

/**
 * Heritage from an IMPORTED interface from a DIFFERENT file.
 */
export declare interface AccessorPropertyComputedName extends BaseNode {
    type: AST_NODE_TYPES.AccessorProperty;
    computed: true;
}

export declare class ParserOptions {
    debugLevel: number;
    getParser(name: string): any;
}
