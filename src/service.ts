import { ExecOptions } from 'node:child_process';
import { isAdminUser } from './cmd';
import { exec } from './exec';
import { isExecError } from './is-exec-error';
import { elevate } from './binaries';
import { Credentials } from './credentials';
import { ServiceConfig } from './service-config';
import { removeFile, sleep } from './utils';

import fs from 'node:fs';
import path from 'node:path';
import xmlString from 'xml';

const WINSERVICE_DIR = 'winservice';
const WRAPPER_FILENAME = path.resolve(path.join(__dirname, './service-entrypoint.js'));
const WINSW_BINARY = path.join(__dirname, '..', 'bin', 'winsw', 'winsw.exe');
const WINSW_NET_CONFIG = path.join(__dirname, '..', 'bin', 'winsw', 'winsw.exe.config');

/**
 * This utility can be used to manage Windows services comprised of Node.js scripts.
 */
export class Service {
    constructor(private config: ServiceConfig) {
        config.script = path.resolve(config.script);
    }

    readonly name = this.config.name;

    /**
     * The root directory where the service files are stored.
     */
    get root() {
        return path.resolve(path.join(path.dirname(this.config.script), WINSERVICE_DIR));
    }

    /**
     * The ID for the process
     */
    get id() {
        return this.config.id;
    }

    /**
     * User account to use when performing system-level commands like install/uninstall/start/stop/restart.
     * This is not the same as the account the service is configured to run as (see config.logOnAs for that)
     * By default, the domain is set to the local computer name, but can be overridden with an AD or LDAP domain. 
     * 
     * Both account and password must be explicitly set if you want the service module to run commands as a specific 
     * user. By default, it will run using the user account that launched the process (i.e. who launched `node app.js`).
     */
    runAs?: Credentials;

    /**
     * Install the service.
     */
    async install() {
        if (this.installed)
            return;

        // If the output directory does not exist, create it.
        if (!fs.existsSync(this.root))
            fs.mkdirSync(this.root);

        // Write the exe file
        await this.createServiceWrapper();
        await this.execute(`"${path.resolve(this.root, `${this.id}.exe`)}" install`);
        await sleep(2);
    }

    /**
     * Uninstall the service.
     * @param waitTime Seconds to wait to allow winsw to finish processing the uninstall command.
     */
    async uninstall(waitTime = 2) {
        if (!this.installed)
            throw new Error(`Service is not currently installed.`);

        await this.stop();

        // Uninstall the process

        let { stderr } = await this.execute(`"${path.resolve(this.root, this.id)}.exe" uninstall`);
        if (stderr.trim().length > 0)
            throw new Error(`Error: ${stderr}`);

        await sleep(waitTime); // Wait for uninstall to fully finish

        // Remove the daemon files, known wrappers, the executable and executable .NET runtime config file, 
        // all other related files. Remote each individually to prevent security warnings.

        removeFile(path.join(this.root, this.id + '.xml'));
        removeFile(path.join(this.root, this.id + '.wrapper.log'));
        removeFile(path.join(this.root, this.id + '.out.log'));
        removeFile(path.join(this.root, this.id + '.err.log'));
        removeFile(path.join(this.root, this.id + '.exe'));
        removeFile(path.join(this.root, this.id + '.exe.config'));
        fs.readdirSync(this.root)
            .filter(file => !/^.+\.((wrapper|out|err)\.log)|(exe|xml)$/g.exec(file))
            .forEach(f => removeFile(f))

        // Remove the directory if it's empty

        if (fs.readdirSync(this.root).length === 0) {
            if (this.root !== path.dirname(this.config.script)) {
                fs.rmdirSync(this.root);
                sleep(1);
            }
        }
    }

    /**
     * Start the service.
     */
    async start() {
        if (!this.installed)
            throw Error(`The service "${this.id}" is not installed`);

        try {
            this.execute(`NET START "${this.id}"`);
        } catch (err) {
            if (isExecError(err) && err.code == 2) {
                if (err.message.includes('already been started') && !err.message.includes('service name is invalid'))
                    return;
            }
            
            throw err;
        }
    }

    /**
     * Stop the service.
     */
    async stop() {
        try {
            await this.execute(`NET STOP "${this.id}"`);
        } catch (err) {
            if (isExecError(err) && err.code == 2)
                return;

            throw err;
        }
    }

    /**
     * Restart the service
     */
    async restart() {
        await this.stop();
        await this.start();
    }

    /**
     * Determine whether the service is installed.
     */
    get installed() {
        return fs.existsSync(path.join(this.root, `${this.id}.exe`))
            && fs.existsSync(path.join(this.root, `${this.id}.xml`));
    }

    /**
     * Execute commands with elevated privileges.
     */
    private async execute(cmd: string, options: ExecOptions = {}): Promise<{ stdout: string; stderr: string; }> {
        if (!await isAdminUser())
            throw new Error('Permission Denied');

        if (this.runAs) {
            return await exec(`runas /profile /user:${this.runAs.domain ?? process.env.COMPUTERNAME}\\${this.runAs.account} ${cmd}`, options);
        } else {
            return await elevate(cmd, options)
        }
    }

    /**
     * Make a copy of the bundled winsw.exe, renamed as per the service ID. Also copy the .NET configuration (needed 
     * when using .NET 4). 
     * 
     * @see https://github.com/kohsuke/winsw#net-runtime-40
     */
    private async createServiceWrapper() {
        fs.copyFileSync(WINSW_BINARY, path.join(this.root, `${this.config.id}.exe`));
        fs.copyFileSync(WINSW_NET_CONFIG, path.join(this.root, `${this.config.id}.exe.config`));
        fs.writeFileSync(path.join(this.root, `${this.config.id}.xml`), this.generateServiceWrapperConfig());
    }

    /**
     * Generate the XML for the winsw configuration file.
     */
    private generateServiceWrapperConfig() {
        return xmlString(
            {
                service: [
                    { id: this.config.id },
                    { name: this.config.name },
                    { description: this.config.description ?? '' },
                    { executable: this.config.execPath ?? process.execPath },
                    { stopparentprocessfirst: String(this.config.stopParentFirst) },
                    { workingdirectory: this.config.workingDirectory ?? process.cwd() },
                    { stoptimeout: `${this.config.stopTimeout ?? 30}sec` },

                    ...this.config.logging?.path ? [{ logpath: this.config.logging?.path }] : [],
                    ...(this.config.dependsOn ?? []).map(depend => ({ depend })),
                    ...Object.entries(this.config.env ?? {}).map(([name, value]) => ({ env: { _attr: { name: name, value: value } } })),

                    {
                        arguments: [
                            ...this.config.nodeOptions ?? [],
                            WRAPPER_FILENAME.trim(),
                            '--event-log', `${this.name}-Wrapper`,
                            '--wait', String(this.config.restartDelay ?? 1),
                            '--grow', String(this.config.restartDelayGrowth ?? 0.25),
                            '--max-restarts', String(this.config.maxRestarts ?? 3),
                            '--max-retries', String(this.config.maxRetries ?? -1),
                            ...(this.config.abortOnError ? ['--abort-on-error'] : []),
                            ...(this.config.stopParentFirst ? ['--stop-parent-first'] : []),
                            this.config.script,
                            ...(this.config.scriptOptions ?? [])
                        ].map(x => `"${x}"`).join(' ')
                    },

                    ...this.config.logging ? [
                        {
                            log: [
                                { _attr: { mode: (this.config.logging.mode || 'append') } },
                                ...this.config.logging.mode === 'roll-by-time' ? [{
                                    pattern: this.config.logging.pattern ?? 'yyyMMdd'
                                }] : [],
                                ...this.config.logging.mode === 'roll-by-size' ? [
                                    { sizeThreshold: (this.config.logging.sizeThreshold || 10240) },
                                    { keepFiles: (this.config.logging.keepFiles || 8) },
                                ] : []
                            ]
                        }
                    ] : [],

                    ...this.config.logOnAs ? [
                        {
                            serviceaccount: [
                                { domain: this.config.logOnAs.domain ?? 'NT AUTHORITY' },
                                { user: this.config.logOnAs.account ?? 'LocalSystem' },
                                { password: this.config.logOnAs.password ?? '' },
                                { allowservicelogon: 'true' }
                            ]
                        }
                    ] : []
                ]
            },
            { indent: '\t' }
        ).replace(/\n/g, '\r\n');
    }

}
