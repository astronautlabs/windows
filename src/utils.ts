import fs from 'node:fs';

export function removeFile(file: string) {
    if (fs.existsSync(file))
        fs.unlinkSync(file);
}

export async function sleep(period: number) {
    return new Promise(resolve => setTimeout(resolve, period));
}