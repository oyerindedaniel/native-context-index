import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackageGraph } from './graph.js';
import type { PackageInfo } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Environmental Context', () => {
  const fixtureDir = path.resolve(__dirname, '../fixtures/environmental-context');

  it('generates synthetic IDs for environmental and custom protocol dependencies', () => {
    const packageInfo: PackageInfo = {
      name: 'environmental-context',
      version: '1.0.0',
      dir: fixtureDir,
      isScoped: false,
    };

    const graph = buildPackageGraph(packageInfo);
    
    const handler = graph.symbols.find(symbol => symbol.name === 'Handler');
    expect(handler).toBeDefined();

    const handleMethod = graph.symbols.find(symbol => symbol.name === 'Handler.handle');
    expect(handleMethod).toBeDefined();
    expect(handleMethod?.dependencies).toContain('node::http::ServerResponse');

    const processMethod = graph.symbols.find(symbol => symbol.name === 'Handler.process');
    expect(processMethod).toBeDefined();
    expect(processMethod?.dependencies).toContain('ext::custom-system::CustomType');

    const pipeMethod = graph.symbols.find(symbol => symbol.name === 'Handler.pipe');
    expect(pipeMethod).toBeDefined();
    expect(pipeMethod?.dependencies).toContain('node::http::ServerResponse');

    expect(handler?.dependencies).toContain('node::fs::WriteStream');
    expect(handler?.dependencies).toContain('node::path::ParsedPath');
    expect(handler?.dependencies).toContain('node::test::test');
  });
});
