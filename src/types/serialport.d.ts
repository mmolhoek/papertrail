/**
 * Stub type declarations for serialport
 * Used when serialport is not installed (chroot environments)
 * Allows TypeScript compilation without the actual package
 */

declare module "serialport" {
  export interface SerialPortOpenOptions {
    path: string;
    baudRate: number;
    autoOpen?: boolean;
  }

  export class SerialPort {
    constructor(options: SerialPortOpenOptions);
    open(callback: (err?: Error) => void): void;
    close(callback?: (err?: Error) => void): void;
    pipe<T>(parser: T): T;
    on(event: string, callback: (...args: any[]) => void): this;
    write(data: string | Buffer, callback?: (err?: Error) => void): void;
    isOpen: boolean;
  }
}

declare module "@serialport/parser-readline" {
  export interface ReadlineParserOptions {
    delimiter?: string;
  }

  export class ReadlineParser {
    constructor(options?: ReadlineParserOptions);
    on(event: string, callback: (...args: any[]) => void): this;
  }
}
