import * as bin from './binaries';
import { exec } from './exec';

/**
 * This asynchronous command determines whether the current user has administrative privileges.
 * It passes a boolean value to the callback, returning `true` if the user is an administrator
 * or `false` if it is not.
 */
export async function isAdminUser(): Promise<boolean> {
    let result = await exec('NET SESSION');
    if (result.stderr.length === 0)
        return true;

    result = await bin.elevate('NET SESSION');
    return result.stderr.length === 0;
}

/**
 * Kill a specific process
 * @param PID Process ID
 * @param force Force close the process.
 */
export async function taskKill(pid: number, force: boolean) {
    if (!pid) {
        throw new Error('PID is required for the kill operation.');
    }

    if (typeof isNaN(pid)) {
        throw new Error('PID must be a number.')
    }

    return await exec(`taskkill /PID ${pid}${force ? ' /f' : ''}`);
}

export interface Win32Process {
    imageName: string;
    pid: number;
    sessionName: string;
    sessionNumber: number;
    memUsage: string;
}

export interface VerboseWin32Process extends Win32Process {
    status: string;
    userName: string;
    cpuTime: string;
    windowTitle: string;
}

/**
 * List the processes running on the server.
 * @param callback Receives the process object as the only callback argument
 * @param verbose Include additional information. This is quite slow.
 */
export async function taskList(): Promise<Win32Process[]>;
export async function taskList(verbose: false): Promise<Win32Process[]>;
export async function taskList(verbose: true): Promise<VerboseWin32Process[]>;
export async function taskList(verbose = false): Promise<(Win32Process | VerboseWin32Process)[]> {
    let result = await exec(`tasklist /FO CSV ${verbose? '/V' : ''}`);

    var p = result.stdout.split('\r\n');
    var proc: Win32Process[] = [];
    var header = null;
    while (p.length > 1) {
        var line = p.shift()!;
        var values = line.replace(/\"\,/gi, '";').replace(/\"|\'/gi, '').split(';');
        if (header == null) {
            header = values;
            for (var i = 0; i < header.length; i++) {
                header[i] = header[i].replace(/ /gi, '');
            }
            continue
        }

        var record: Record<string, string> = {};

        for (var i = 0; i < values.length; i++)
            record[header[i]] = values[i].replace(/\"|\'/gi, '');

        if (verbose) {
            proc.push(<VerboseWin32Process>{
                imageName: record.ImageName,
                memUsage: record.MemUsage,
                pid: Number(record.PID),
                sessionName: record.SessionName,
                sessionNumber: Number(record['Session#']),
                status: record.Status,
                userName: record.UserName,
                cpuTime: record.CPUTime, 
                windowTitle: record.WindowTitle
            });
        } else {
            proc.push({
                imageName: record.ImageName,
                memUsage: record.MemUsage,
                pid: Number(record.PID),
                sessionName: record.SessionName,
                sessionNumber: Number(record['Session#'])
            });
        }
    }

    return proc;
}