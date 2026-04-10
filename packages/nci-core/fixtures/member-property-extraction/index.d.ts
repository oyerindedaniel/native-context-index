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

/** Const object literal shape (caliper-style) for `parentSymbolId` tests. */
export declare const BRIDGE_METHODS: {
    readonly SELECT: "BRIDGE_SELECT";
    readonly MEASURE: "BRIDGE_MEASURE";
};

/** Interface member with `MethodSignature` (vs object literal / class body shapes). */
export declare interface MethodSigParent {
    onFlush(): void;
}

/**
 * Exported namespace: qualified `Ns.Child.member` parents, including nested interface
 * `PropertySignature` / `MethodSignature` and a namespace-level function export.
 */
export declare namespace CaliperNS {
    export interface BenchOpts {
        label: string;
        refresh(): void;
    }
    export function snapshot(): void;
}

/**
 * Nested namespace + class: `*.prototype.*` members resolve parent to the qualified class
 * symbol (`OuterNS.InnerWidget`), matching `parent_name_for_dotted_member` (prefix before `prototype`).
 */
export declare namespace OuterNS {
    export declare class InnerWidget {
        slot: string;
        mount(): void;
    }
}
