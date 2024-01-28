import {Logger} from "../ble/logger";
import {BLEData, BLEListener} from "../ble/interface";
import {Device} from "react-native-ble-plx";
import {PLXPeripheral} from "../ble/plx_peripheral";
import axios from "axios";

test('adds 1 + 2 to equal 3', () => {
  const logger = new Logger([], "info")
  let manager: PLXPeripheral
  let listener: BLEListener = {
    onScaleDone(data: any): void {
      logger.info(`scale done with data ${JSON.stringify(data, null, 2)}`)
    },
    onStartScale(data: BLEData): void {
      logger.info(`starting to scale with uuid`)
    },
    onClose(): void {
    },
    async onConnect({peripheralId}: { peripheralId: string }): Promise<void> {
      logger.debug(`connected ${peripheralId} ${1}`)
    },
    onData(err, data): void {
    },
    onDisconnect(): void {
      logger.info("device disconnected")
    },
    async onDiscover(peripheral: Device): Promise<void> {
      // await manager.stopScan()
      logger.debug(`found ${peripheral.id} ${peripheral.name} ${JSON.stringify(peripheral)}`)

      const profileInfo = {
        nickname: "duc",
        height: "168",
        dob: "1995-02-10T00:00:00Z",
        calendar: new Date().toISOString(),
        gender: 0,
        tare: "0.0",
      }

      const bond = true
      await manager.connectAndScale(peripheral, profileInfo, 0, bond)
      logger.debug(`connect done -> process`)
    },
    onStateUpdate(state): void {
    },
    onStopScan({status, isTimeout}: { status: number; isTimeout: boolean }): void {
      logger.debug(`stop scan with status ${status} ${isTimeout}`)
    },
  }

  // manager = new BLEPeripheral(listener, logger)
  const httpObj = axios.create({baseURL: process.env.BASE_UR})
  manager = new PLXPeripheral(listener, logger, httpObj)

  manager.scan(10, "TNT_", "")
});
