import { exec } from 'node:child_process';
import { elevate } from './binaries';

export interface LoggerConfig {
  /**
   * The source of the log information. This is commonly the title of an application
   * or the Node.js script name (i.e. MyApp). Defaults to "Node.js".
   */
  source: string;

  /**
   * Defaults to "APPLICATION"
   */
  eventLog: 'APPLICATION' | 'SYSTEM';
}

/**
 * Write to the Windows event log (as shown in Event Viewer).
 */
export class Logger {
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      source: 'Node.js',
      eventLog: 'APPLICATION',
      ...config
    };
  }

  private config: LoggerConfig;

  get eventLog(): 'APPLICATION' | 'SYSTEM' {
    return this.config.eventLog;
  }

  /**
   * The event log where messages should be written. This is either `APPLICATION` or `SYSTEM`.
   */
  set eventLog(value) {
    this.config.eventLog = value;
  }

  /**
   * Log an informational message.
   * @param message The content of the log message.
   * @param code The event code to assign to the message. Must be 1000 or less, defaults to 1000.
   */
  async info(message: string, code = 1000) {
    await this.log('INFORMATION', message, code);
  }

  /**
   * Log an error message.
   * @param message The content of the log message.
   * @param code The event code to assign to the message. Must be 1000 or less. Defaults to 1000.
   */
  async error(message: string, code = 1000) {
    await this.log('ERROR', message, code);
  }

  /**
   * Log a warning message.
   * @param message The content of the log message.
   * @param code The event code to assign to the message. Must be 1000 or less. Defaults to 1000.
   */
  async warn(message: string, code = 1000) {
    await this.log('WARNING', message, code);
  }

  /**
   * Log an audit success message.
   * @param message The content of the log message.
   * @param code The event code to assign to the message. Must be 1000 or less. Defaults to 1000.
   */
  async auditSuccess(message: string, code = 1000) {
    await this.log('SUCCESSAUDIT', message, code);
  }

  /**
   * Log an audit failure message.
   * @param message The content of the log message.
   * @param code The event code to assign to the message. Must be 1000 or less. Defaults to 1000.
   */
  async auditFailure(message: string, code = 1000) {
    await this.log('FAILUREAUDIT', message, code);
  }

  /**
   * Create a log message.
   */
  async log(type: 'ERROR' | 'WARNING' | 'INFORMATION' | 'SUCCESSAUDIT' | 'FAILUREAUDIT', msg: string, id = 1000) {
    let cmd: string;

    if (msg.trim().length == 0)
      return;

    msg = msg.replace(/\r\n|\n\r|\r|\n/g, "\f")
    cmd = `eventcreate /L ${this.config.eventLog} /T ${type} /SO \"${this.config.source}\" /D \"${msg}\" /ID ${id}`;

    try {
      await exec(cmd);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Access is denied")) {
        await elevate(cmd);
      } else {
        throw e;
      }
    }
  }
}