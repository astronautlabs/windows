import { ExecOptions } from 'node:child_process';
import path from 'node:path';
import { exec } from './exec';

const BIN = path.join(__dirname, '..', 'bin');

/**
 * Attempt to elevate the privileges of the current user to a local administrator using UAC.
 * 
 * @param cmd The command to execute
 * @param options Passed to `child_process.exec()`
 */
export function elevate(cmd: string, options: { encoding?: "buffer" | null; } & ExecOptions = {}) {
    return exec('"' + path.join(BIN, 'elevate', 'elevate.cmd') + '" ' + cmd, { encoding: null, ...options });
};