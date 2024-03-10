import { ExecException } from "child_process";

export function isExecError(error: any): error is ExecException {
    return 'code' in error;
}