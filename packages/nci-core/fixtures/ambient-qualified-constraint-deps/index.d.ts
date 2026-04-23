export interface LocalSink {
  write(chunk: Uint8Array): void;
}

declare namespace stream {
  interface Writable {
    write(chunk: Uint8Array): void;
  }
}

declare namespace NodeJS {
  interface WritableStream extends stream.Writable {}
}

export interface StreamBridge {
  pipeToNodeWritable<T extends NodeJS.WritableStream>(output: T): T;
  pipeToLocal<U extends LocalSink>(output: U): U;
}
