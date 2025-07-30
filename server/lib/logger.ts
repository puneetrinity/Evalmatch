/**
 * Logger utility for the application
 * Provides environment-aware logging with different log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

class Logger {
  private logLevel: LogLevel;
  private isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.logLevel = this.getLogLevel();
  }

  private getLogLevel(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'NONE': return LogLevel.NONE;
      default: return this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data !== undefined) {
      if (typeof data === 'object') {
        formattedMessage += ' ' + JSON.stringify(data, null, 2);
      } else {
        formattedMessage += ' ' + data;
      }
    }
    
    return formattedMessage;
  }

  debug(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.logLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  error(message: string, error?: Error | unknown): void {
    if (this.logLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message));
      if (error) {
        console.error(error);
      }
    }
  }

  // Production-safe logging methods
  prodLog(message: string, data?: unknown): void {
    if (!this.isDevelopment) {
      this.info(message, data);
    }
  }

  devLog(message: string, data?: unknown): void {
    if (this.isDevelopment) {
      this.debug(message, data);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export default logger instance
export default logger;