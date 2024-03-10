import * as os from 'node:os';

if (os.platform().indexOf('win32') < 0) {
    throw new Error('@astronautlabs/windows is only supported on Windows.');
}
  
export * from './binaries';
export * from './cmd';
export * from './service';
export * from './eventlog';