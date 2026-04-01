// In index.d.ts of 'main-pkg'
import { SharedType } from "dep-pkg";
export declare const x: SharedType;

// In index.d.ts of 'dep-pkg'
export interface SharedType {
    id: string;
}
