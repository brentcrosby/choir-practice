declare module "verovio/wasm" {
  export default function createVerovioModule(): Promise<unknown>;
}

declare module "verovio/esm" {
  export class VerovioToolkit {
    constructor(module: unknown);
    loadData(data: string): boolean;
    setOptions(options: Record<string, unknown>): void;
    renderToSVG(page: number, options?: Record<string, unknown>): string;
  }
}
