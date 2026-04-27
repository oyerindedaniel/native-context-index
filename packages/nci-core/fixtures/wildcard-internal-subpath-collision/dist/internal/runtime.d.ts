import type { Result } from "./result.js";

export interface Entity {
  id: string;
  source: "runtime";
}

export declare const Entity: {
  create(id: string): Entity;
};

export declare function createEntity(id: string): Result;

export declare function makeEntityValue(): Entity;

export type EntityDual = Entity | typeof Entity;
