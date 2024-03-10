import { CommandLine, CommandLineOption } from '@alterior/command-line';
import { ChildProcess, fork } from 'child_process';
import { Logger } from './eventlog';

import fs from 'node:fs';
import net from 'node:net';
import p from 'node:path';

const PKG = require('../package.json');
const MAX = 60;

export interface ServiceContainerOptions {
    /**
     * The absolute path of the script to be run as a process.
     */
    file: string;
    eventLog?: 'APPLICATION' | 'SYSTEM';
    args?: string[];
    logSource?: string;
    maxRetries?: number;
    maxRestarts?: number;
    restartDelay?: number; // was 'wait'
    restartDelayGrowth?: number; // was 'grow'
    abortOnError?: boolean;

    /**
     * Allow the script to exit using a shutdown message.
     */
    stopParentFirst?: boolean;

    cwd?: string;
}

export class ServiceContainer {
    constructor(private options: ServiceContainerOptions) {
        this.keepAlive();
    }

    private child: ChildProcess | null = null;
    private starts = 0;

    private cwd = this.options.cwd;
    private args = this.options.args ?? [];
    private maxRestarts = this.options.maxRestarts ?? 5;
    private maxRetries = this.options.maxRetries ?? -1;
    private eventLog = this.options.eventLog ?? 'APPLICATION';
    private logSource = this.options.logSource ?? 'Unknown Application';
    private abortOnError = this.options.abortOnError ?? false;
    private stopParentFirst = this.options.stopParentFirst ?? false;
    private log = new Logger({ source: this.logSource, eventLog: this.eventLog });
    private script = p.resolve(this.options.file);
    private wait = (this.options.restartDelay ?? 1) * 1000;
    private grow = (this.options.restartDelayGrowth ?? 0.25) + 1;
    private attempts = 0;
    private startTime = 0;
    private forcekill = false;

    start() {
        process.on('exit', () => this.killkid());
        process.on("SIGINT", () => this.killkid());
        process.on("SIGTERM", () => this.killkid());

        process.on('uncaughtException', err => {
            this.launch('warn', err.message);
        });

        // Launch the process
        this.launch('info', 'Starting ' + this.script);
    }

    private keepAlive() {
        // Hack to force the wrapper process to stay open by launching a ghost socket server
        var server = net.createServer().listen();

        server.on('error', err => {
            this.launch('warn', err.message);
            server = net.createServer().listen();
        });

    }

    /**
     * @method monitor
     * Monitor the process to make sure it is running
     */
    private monitor() {
        if (!this.child || !this.child.pid) {

            // If the number of periodic starts exceeds the max, kill the process
            if (this.starts >= this.maxRestarts) {
                if (Date.now() - (MAX * 1000) <= this.startTime) {
                    this.log.error('Too many restarts within the last ' + MAX + ' seconds. Please check the script.');
                    process.exit();
                }
            }

            setTimeout(() => {
                this.wait = this.wait * this.grow;
                this.attempts += 1;
                if (this.attempts > this.maxRetries && this.maxRetries >= 0) {
                    this.log.error(`Too many restarts. ${this.script} will not be restarted because the maximum number of total restarts has been exceeded.`);
                    process.exit();
                } else {
                    this.launch('warn', `Restarted ${this.wait} msecs after unexpected exit; attempts = ${this.attempts}`);
                }
            }, this.wait);
        } else {
            // reset attempts and wait time
            this.attempts = 0;
            this.wait = this.wait * 1000;
        }
    }

    /**
     * @method launch
     * A method to start a process.
     * logLevel - optional logging level (must be the name of a function the the Logger object)
     * msg - optional msg to log
     */
    private launch(logLevel: 'info' | 'error' | 'warn' | 'auditSuccess' | 'auditFailure', msg: string) {
        if (this.forcekill) {
            this.log.info("Process killed");
            return;
        }

        //log.info('Starting '+argv.f);
        if (logLevel && msg) {
            this.log[logLevel](msg);
        }

        // Set the start time if it's null
        if (this.startTime === 0) {
            this.startTime = Date.now();
            setTimeout(() => {
                this.startTime = 0;
                this.starts = 0;
            }, (MAX * 1000) + 1);
        }
        this.starts += 1;

        // Fork the child process
        this.child = fork(this.script, this.args, { 
            env: process.env,
            cwd: this.cwd,
            detached: this.stopParentFirst
        });

        // When the child dies, attempt to restart based on configuration
        this.child.on('exit', code => {
            this.log.warn(this.script + ' stopped running.');

            // If an error is thrown and the process is configured to exit, then kill the parent.
            if (code !== 0 && this.abortOnError) {
                this.log.error(`${this.script} exited with error code ${code}`);
                process.exit();
                //server.unref();
            } else if (this.forcekill) {
                process.exit();
            }

            this.child = null;
            // Monitor the process
            this.monitor();
        });
    };

    private killkid() {
        this.forcekill = true;
        if (this.child) {
            if (this.stopParentFirst) {
                this.child.send('shutdown');
            } else {
                this.child.kill();
            }
        } else {
            this.log.warn('Attempted to kill an unrecognized process.')
        }
    }

    private static numberOptionValidator(name: string) {
        return function (this: CommandLineOption) {
            if (isNaN(Number(this.value))) {
                console.log(`Invalid value for ${name}`);
                process.exit(1);
            }
        }
    }

    public static main() {

        let line = new CommandLine()
            .info({
                argumentUsage: '<file> [script-args]',
                copyright: '© 2024 Astronaut Labs LLC, Corey Butler, Schley Andrew Kutz',
                description: 'Runs a Node.js script as a Windows service, handling intelligent restarts and errors',
                executable: 'nws',
                version: PKG.version
            })
            .option({
                id: 'cwd',
                short: 'd',
                description: 'The current working directory to use while running the script',
                valueHint: 'dir',
                handler() {
                    if (!fs.existsSync(p.resolve(this.value!))) {
                        console.error(`Invalid value for --cwd, -d: ${this.value} not found.`);
                        process.exit(1);
                    }
                }
            })
            .option({
                id: 'log-source',
                short: 'l',
                description: 'The descriptive name of the log for the process',
                valueHint: 'dir'
            })
            .option({
                id: 'event-log',
                short: 'e',
                description: 'The event log container. This must be APPLICATION or SYSTEM.',
                valueHint: 'APPLICATION|SYSTEM',
                value: 'APPLICATION',
                handler() {
                    if (!['APPLICATION', 'SYSTEM'].includes(this.value!)) {
                        console.log(`Invalid value for --event-log, -e`);
                        process.exit(1);
                    }
                }
            })
            .option({
                id: 'max-retries',
                short: 'm',
                description: 'The maximum number of times the process will be auto-restarted.',
                valueHint: 'number',
                value: '-1',
                handler: this.numberOptionValidator('--max-retries, -m')
            })
            .option({
                id: 'max-restarts',
                short: 'r',
                description: `The maximum number of times the process should be restarted within a ${MAX} second period before shutting down.`,
                valueHint: 'number',
                value: '5',
                handler: this.numberOptionValidator('--max-restarts, -r')
            })
            .option({
                id: 'wait',
                short: 'w',
                description: `The number of seconds between each restart attempt.`,
                valueHint: 'seconds',
                value: '1',
                handler: this.numberOptionValidator('--wait, -w')
            })
            .option({
                id: 'grow',
                short: 'g',
                description: `A growth rate at which the wait time is increased (0-1)`,
                valueHint: 'factor',
                value: '0.25',
                handler: this.numberOptionValidator('--grow, -g')
            })
            .option({
                id: 'abort-on-error',
                short: 'a',
                description: `Do not attempt to restart the process if it fails with an error`
            })
            .option({
                id: 'stop-parent-first',
                short: 's',
                description: `Allow the script to exit using a shutdown message.`
            })
            .run(args => {
                if (args.length < 1) {
                    line.showUsage();
                    process.exit(1);
                }

                let logSource = line.option('log-source').value;
                if (!logSource) {
                    console.log(`The --log-source option is required.`);
                    process.exit(1);
                }

                let file = args[0];
                if (!fs.existsSync(p.resolve(file))) {
                    console.log(`${file} does not exist or cannot be found.`);
                    process.exit(1);
                }

                let cwd = line.option('cwd').value;
                if (cwd)
                    cwd = p.resolve(cwd);

                let container = new ServiceContainer({
                    file: p.resolve(file),
                    cwd,
                    eventLog: line.option('event-log').value as 'APPLICATION' | 'SYSTEM',
                    logSource,
                    maxRestarts: Number(line.option('max-restarts').value),
                    maxRetries: Number(line.option('max-retries').value),
                    restartDelay: Number(line.option('wait').value),
                    restartDelayGrowth: Number(line.option('grow').value),
                    stopParentFirst: line.option('stop-parent-first').present,
                    abortOnError: line.option('abort-on-error').present,
                })

                container.start();
            })
            .process();
    }
}