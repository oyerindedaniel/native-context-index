export declare function createServer(): Server;
export interface Server {
  listen(port: number): void;
  close(): void;
}
