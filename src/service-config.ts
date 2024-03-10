import { Credentials } from './credentials';


export interface ServiceConfig {
    /**
     * This is is how the service is identified. Alphanumeric, no spaces.
     */
    id: string;

    /**
     * The descriptive name of the service.
     */
    name: string;

    /**
     * The absolute path of the script to launch as a service.
     * @required
     */
    script: string;

    /**
     * The description that shows up in the service manager.
     */
    description: string;

    /**
     * Options to be passed to the node process.
     */
    nodeOptions?: string[];

    /**
     * The maximum number of restart attempts to make before the service is considered non-responsive/faulty.
     * Defaults to unlimited (-1).
     */
    maxRetries?: number;

    /**
     * The maximum number of restarts within a 60 second period before haulting the process.
     * This cannot be _disabled_, but it can be rendered ineffective by setting a value of `0`.
     * Defaults to 3.
     */
    maxRestarts?: number;

    /**
     * Setting this to `true` will force the process to exit if it encounters an error that stops the node.js script from running.
     * This does not mean the process will stop if the script throws an error. It will only abort if the
     * script throws an error causing the process to exit (i.e. `process.exit(1)`).
     * Defaults to false.
     */
    abortOnError?: boolean;

    /**
     * Allow the service to shutdown cleanly. Defaults to false.
     */
    stopParentFirst?: boolean;

    /**
     * How long to wait (in seconds) before force killing the application.
     * This only takes effect when stopParentFirst is enabled.
     * Defaults to 30 seconds.
     */
    stopTimeout?: number;

    /**
     * Options to be passed to the script.
     */
    scriptOptions?: string[];

    /**
     * The initial number of seconds to wait before attempting a restart (after the script stops).
     * Defaults to 1 second.
     */
    restartDelay?: number;

    /**
     * A number between 0-1 representing the percentage growth rate for the #wait interval.
     * Setting this to anything other than `0` allows the process to increase it's wait period
     * on every restart attempt. If a process dies fatally, this will prevent the server from
     * restarting the process too rapidly (and too strenuously).
     * Defaults to 0.25.
     */
    restartDelayGrowth?: number;

    /**
     * See [winsw docs](https://github.com/kohsuke/winsw/tree/winsw-1.17#logging).
     */
    logging?: {
        /**
         * Valid values include `rotate` (default), `reset` (clear log), `roll` (move to .old), and `append`.
         */
        mode?: 'rotate' | 'reset' | 'roll' | 'append' | 'roll-by-time' | 'roll-by-size';
        pattern?: string;

        /**
         * The absolute path to the directory where logs should be stored. Defaults to the current directory.
         */
        path?: string;

        /**
         * How large a log file should be before being rolled (in bytes). Only used when mode is 'roll-by-size'.
         * Defaults to 10240.
         */
        sizeThreshold?: number;

        /**
         * How many files to keep when roll mode is active. Defaults to 8.
         */
        keepFiles?: number;
    };

    /**
     * User the service should run as once installed. If the account does not have the "Allow Log On As A Service"
     * permission, it will be automatically granted. If left unspecified the service will run as the "Local System"
     * account.
     */
    logOnAs?: Credentials;

    workingDirectory?: string;

    /**
     * Path to the Node.js executable. If omitted process.execPath (the current Node.js) is used.
     */
    execPath?: string;

    /**
     * List of service names on which this service will be dependant on
     */
    dependsOn?: string[];
    allowServiceLogon?: boolean;

    /**
     * An optional set of environment variables to pass to the Node.js script.
     */
    env?: Record<string, string>;
}
