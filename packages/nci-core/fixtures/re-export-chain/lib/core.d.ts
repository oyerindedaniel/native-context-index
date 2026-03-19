/**
 * Options for creating a Server instance.
 */
export interface ServerOptions {
  port: number;
  host?: string;
}

/**
 * A basic HTTP server.
 */
export declare class Server {
  constructor(options: ServerOptions);
  listen(): Promise<void>;
  close(): void;
}
