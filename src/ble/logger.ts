import { defLvlType, logger } from "react-native-logs"

const log = logger.createLogger({
  async: true,
  asyncFunc: require("react-native").InteractionManager.runAfterInteractions,
})

interface LoggerInterface {
  debug(message: string, ...args: any[]): void;

  info(message: string, ...args: any[]): void;

  warn(message: string, ...args: any[]): void;

  error(message: string, ...args: any[]): void;
}

export class Logger implements LoggerInterface {
  private additionalData: string[] = []
  constructor(additionalData: string[], level: defLvlType) {
    if (!additionalData) {
      additionalData = []
    }
    this.additionalData = additionalData
    log.setSeverity(level)
  }

  private enrichMsg(message: string): string {
    if (!this.additionalData || this.additionalData.length === 0) {
      return message
    }

    return `${this.additionalData.map(i => `[${i}]`).join(" ")} ${message}`
  }

  debug(message: string, ...args: any[]): void {
    log.debug(this.enrichMsg(message), ...args)
  }

  error(message: string, ...args: any[]): void {
    log.error(this.enrichMsg(message), ...args)
  }

  info(message: string, ...args: any[]): void {
    log.info(this.enrichMsg(message), ...args)
  }

  warn(message: string, ...args: any[]): void {
    log.warn(this.enrichMsg(message), ...args)
  }
}
