- yarn add
```
    "axios": "^1.6.5",
    "buffer": "^6.0.3",
    "react-native-ble-plx": "^3.1.2",
    "react-native-buffer": "^6.0.3",
    "react-native-device-info": "^10.12.0",
    "react-native-logs": "^5.0.1",
    "react-native-permissions": "^4.0.2",
    "tntble": "git+ssh://git@github.com:nhdms/tntble.git#master",
```

```typescript
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
```
