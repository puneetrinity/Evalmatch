/**
 * Logger utility for the application
 * Provides environment-aware logging with different log levels
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["_DEBUG"] = 0] = "_DEBUG";
    LogLevel[LogLevel["_INFO"] = 1] = "_INFO";
    LogLevel[LogLevel["_WARN"] = 2] = "_WARN";
    LogLevel[LogLevel["_ERROR"] = 3] = "_ERROR";
    LogLevel[LogLevel["_NONE"] = 4] = "_NONE";
})(LogLevel || (LogLevel = {}));
class Logger {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV === "development";
        this.logLevel = this.getLogLevel();
    }
    getLogLevel() {
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        switch (envLevel) {
            case "DEBUG":
                return LogLevel._DEBUG;
            case "INFO":
                return LogLevel._INFO;
            case "WARN":
                return LogLevel._WARN;
            case "ERROR":
                return LogLevel._ERROR;
            case "NONE":
                return LogLevel._NONE;
            default:
                return this.isDevelopment ? LogLevel._DEBUG : LogLevel._INFO;
        }
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] [${level}] ${message}`;
        if (data !== undefined) {
            if (typeof data === "object") {
                formattedMessage += " " + JSON.stringify(data, null, 2);
            }
            else {
                formattedMessage += " " + data;
            }
        }
        return formattedMessage;
    }
    debug(message, data) {
        if (this.logLevel <= LogLevel._DEBUG) {
            console.debug(this.formatMessage("DEBUG", message, data));
        }
    }
    info(message, data) {
        if (this.logLevel <= LogLevel._INFO) {
            console.info(this.formatMessage("INFO", message, data));
        }
    }
    warn(message, data) {
        if (this.logLevel <= LogLevel._WARN) {
            console.warn(this.formatMessage("WARN", message, data));
        }
    }
    error(message, error) {
        if (this.logLevel <= LogLevel._ERROR) {
            console.error(this.formatMessage("ERROR", message));
            if (error) {
                console.error(error);
            }
        }
    }
    // Production-safe logging methods
    prodLog(message, data) {
        if (!this.isDevelopment) {
            this.info(message, data);
        }
    }
    devLog(message, data) {
        if (this.isDevelopment) {
            this.debug(message, data);
        }
    }
}
// Export singleton instance
export const logger = new Logger();
// Export default logger instance
export default logger;
