const localRef = "test";
export default localRef;
export default { key: 'val' };
export type { MyType } from './mod';
export * as namespacedImport from './mod';
type TypeA = import("pkg").Inner.Type;
interface Inherit extends External.Base {}
import Equal = require("pkg");
