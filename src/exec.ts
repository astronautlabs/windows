import { ExecOptions } from "node:child_process";
import childProcess from 'node:child_process';

export function exec(cmd: string, options: ExecOptions = {}) {
    return new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
        childProcess.exec(cmd, { encoding: 'utf-8', ...options }, (error, stdout, stderr) => {
            if (error)
                reject(error);
            else
                resolve({ stdout, stderr });
        });
    })
};