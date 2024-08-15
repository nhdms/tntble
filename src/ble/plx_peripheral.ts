import {BLECallback, BLEData, BLEListener, BLEPeripheral, BLERequest, ManagerState} from "./interface"
import {BleErrorCode, BleManager, Device, ScanMode, State} from "react-native-ble-plx"
import {base64ToHexString, hexStringToBase64} from "./node_buffer"
import {Buffer} from "buffer"
import {
  BLEMessage,
  BLEMessageType,
  getBLEMessageType,
  getKeyByValue,
  handlePermission,
  isAndroid,
  sleep,
  toHexString,
} from "./ble"
import {AxiosInstance} from "axios"
import {TNTDeviceInfo, TNTUserInfo} from "./tnt"
import {Logger} from "./logger";

export class PLXPeripheral implements BLEPeripheral {
  private readonly manager: BleManager
  private peripheral: Map<string, Device> = new Map<string, Device>()
  private listener: BLEListener
  private logger: Logger
  device: Device | undefined
  private currentWriteRequest: BLERequest | undefined

  private httpClient: AxiosInstance

  private profileInfo: TNTUserInfo | undefined
  private deviceInfo: TNTDeviceInfo | undefined

  private requestMessages: BLERequest[] = []
  private receivedMessages = new Map<BLEMessageType, number[]>()
  private messageQueue: Record<string, number[]> = {}
  private state = ManagerState.Initialized;
  private offlineMeasures: string[];

  constructor(listener: BLEListener, l: Logger, httpClient: AxiosInstance) {
    this.manager = new BleManager()
    this.listener = listener
    this.logger = l
    this.httpClient = httpClient
    handlePermission().then(() => {
      this.logger.debug("init done")
      this.manager.onStateChange(this.listener.onStateUpdate)
    })
    this.state = ManagerState.Initialized
  }

  getProfile() {
    return this.profileInfo
  }

  getState(): ManagerState {
    return this.state
  }

  async connect(deviceId: string, onData: BLECallback | undefined) {
    try {
      this.state = ManagerState.Connecting
      let device = this.peripheral.get(deviceId)
      if (!device) {
        throw `device ${deviceId} not found`
      }

      this.messageQueue = {}
      this.receivedMessages = new Map<BLEMessageType, number[]>()

      this.device = device
      this.device = await this.device.connect({
        requestMTU: 185,
        refreshGatt: "OnConnected",
      })
      this.state = ManagerState.Connected
      this.listener.onConnect({peripheralId: deviceId})
      this.device = await this.device.discoverAllServicesAndCharacteristics()
      const services = await this.device.services()
      const errorFired = {}
      for (const svc of services) {
        const characteristics = await svc.characteristics()
        for (const ch of characteristics) {
          if (ch.isNotifiable || ch.isIndicatable) {
            ch.monitor((err, callbackCh) => {
              if (err) {
                this.logger.debug(`${ch.uuid} characteristics error ${err}`)
                if (this.state >= ManagerState.ScaleDone) {
                  // dont handle error when scale done
                  return
                }
                if (err.errorCode === BleErrorCode.DeviceDisconnected) {
                  // deduplicate event disconnected
                  const key = JSON.stringify(err)
                  if (errorFired[key]) {
                    return
                  }
                  errorFired[key] = true
                }

                this.listener.onError('onData', err)
                return
              }
              const val = callbackCh?.value
              if (!val) {
                return
              }

              this.logger.debug(`[${ch.uuid} | ${ch.isNotifying} | ${this.currentWriteRequest?.name}] receive message ${base64ToHexString(val)}`)

              const value = Buffer.from(val, "base64")
              const totalMsg = ((value[1] & 15) << 8) + (value[2] & 255)
              const currentMsg = ((value[0] & 255) << 4) + ((value[1] & 240) >> 4)
              const isLastMessage = totalMsg - currentMsg === 0

              if (!this.messageQueue[ch.uuid]) {
                this.messageQueue[ch.uuid] = []
              }

              if (!isLastMessage) {
                // @ts-ignore
                this.messageQueue[ch.uuid].push(...value)
                return
              }
              const payload = this.messageQueue[ch.uuid]
              this.messageQueue[ch.uuid] = []
              // @ts-ignore
              payload.push(...value)

              const callbackPayload = {
                value: payload,
                characteristic: ch.uuid,
                service: ch.serviceUUID,
                writeRequest: this.currentWriteRequest,
              }
              if (onData) {
                onData(callbackPayload)
              }

              this.listener.onData(null, callbackPayload)
            })
          }
        }
      }
    } catch (e) {
      this.listener.onError('connect', e)
      this.logger.debug(`Error on connect ${e}`)
    }
  }

  async init() {
  }

  async stopScan() {
    try {
      if (this.manager) {
        this.manager.stopDeviceScan()
      }
      this.listener.onStopScan({status: 1, isTimeout: false})
    } catch (e) {
      this.listener.onError('stopScan', e)
    }
  }

  async scan(secondToScan: number = 10, name: string = "", address: string = ""): Promise<void> {
    try {
      await this.enableBluetooth()
      this.peripheral = new Map<string, Device>()
      this.device = undefined

      setTimeout(() => {
        this.stopScan()
      }, secondToScan * 1000)
      this.state = ManagerState.Scanning
      this.manager.startDeviceScan(null, {
        scanMode: ScanMode.LowLatency,
      }, (error, device) => {
        if (error) {
          throw error
        }

        if (!device) {
          return
        }

        if (!this.isNameOrAddressMatch(device, name, address)) {
          return
        }

        this.peripheral.set(device.id, device)
        this.listener.onDiscover(device)
      })
      return Promise.resolve()
    } catch (e) {
      this.listener.onError('scan', e)
    }
  }

  private isNameOrAddressMatch(device: Device, name: string, address: string) {
    name = name.toLowerCase().trim()
    address = address.toLowerCase().trim()

    if (name.length === 0 && address.length === 0) {
      return true
    }

    if (address.length > 0) {
      return device.id.toLowerCase().indexOf(address) > -1
    }

    if (device.name && device.name.toLowerCase().indexOf(name) > -1) {
      return true
    }

    return !!(device.localName && device.localName.toLowerCase().indexOf(name) > -1)
  }

  async write(request: BLERequest) {
    try {
      if (!this.device) {
        throw "device not found"
      }
      this.currentWriteRequest = request
      if (request.delayInMilis && request.delayInMilis > 0) {
        await sleep(request.delayInMilis)
      }

      for (const p of request.payload) {
        this.logger.debug(`start write ${p} | b64: ${hexStringToBase64(p)}`)
        if (request.withResponse) {
          await this.device.writeCharacteristicWithResponseForService(request.service_id, request.characteristic_id, hexStringToBase64(p))
          continue
        }
        await this.device.writeCharacteristicWithoutResponseForService(request.service_id, request.characteristic_id, hexStringToBase64(p))
      }
    } catch (e) {
      this.listener.onError('write', {request, error: e})
    }
  }

  getDevice(): Device | undefined {
    return this.device
  }

  async onClose() {
    try {
      if (this.manager) {
        this.manager.destroy()
      }
    } catch (e) {
      this.listener.onError('close', e)
    }
  }

  private async enableBluetooth() {
    const state = await this.manager.state()
    if (state !== State.PoweredOn) {
      if (isAndroid()) {
        await this.manager.enable()
      }
    }
  }

  async connectAndScale(
    device: Device,
    profileInfo: TNTUserInfo,
    slot = 0,
    bond = false,
    forceOverWriteProfile = false,
    offlineScale = false,
  ) {
    if (!device || !device.id) {
      throw "device not found"
    }

    if (!profileInfo || !profileInfo.uuid) {
      throw "profile not found or missing uuid"
    }

    this.profileInfo = {...profileInfo, slot: slot}
    this.requestMessages = []

    const actions = [
      new BLEMessage(BLEMessageType.Disconnect),
      new BLEMessage(BLEMessageType.WriteDate),
      new BLEMessage(BLEMessageType.VerifyUUID, this.profileInfo?.uuid),
      new BLEMessage(BLEMessageType.RetrieveDeviceInfo),
      new BLEMessage(BLEMessageType.RetrieveUserInfo, slot), // user at slot 0
      // new BLEMessage(BLEMessageType.RetrieveUserInfo, 1), // user at slot 1
      // new BLEMessage(BLEMessageType.RetrieveUserInfo, 2),
      // new BLEMessage(BLEMessageType.RetrieveUserInfo, 3),
    ]

    const pairMessages = await this.httpClient.post("/messages", {
      "actions": actions.map(a => a.getAction()),
    })

    if (!pairMessages.data) {
      throw "server error"
    }

    if (pairMessages.data.error) {
      this.logger.error(`Fetch pair message error ${pairMessages.data.error}`)
      throw `fetch pair message error ${pairMessages.data.error}`
    }

    this.requestMessages = pairMessages.data.data.actions
    await this.connect(device.id, async (data) => {
      if (!data.writeRequest) {
        this.logger.debug(`request not found ${JSON.stringify(data)}`)
        return
      }

      const responseType = getBLEMessageType(data.value)
      this.receivedMessages.set(responseType, data.value)

      switch (responseType) {
        case BLEMessageType.VerifyUUID:
          await this.requestNextAction(BLEMessageType.WriteDate)
          return
        case BLEMessageType.WriteDate:
          await this.requestNextAction(BLEMessageType.RetrieveDeviceInfo)
          return
        case BLEMessageType.RetrieveDeviceInfo:
          await this.requestNextAction(BLEMessageType.RetrieveUserInfo)
          return
        case BLEMessageType.RetrieveUserInfo:
          if (bond) {
            forceOverWriteProfile = false
          }
          await this.exchangeUserInfo(slot, forceOverWriteProfile)
          return
        case BLEMessageType.ExchangeUserInfo:
          if (!bond) {
            await this.requestNextAction(BLEMessageType.SaveUUID)
            return
          }
          await this.requestNextAction(BLEMessageType.Measure)
          await sleep(1000)
          this.onStartScale(data, this.profileInfo)
          return
        case BLEMessageType.SaveUUID:
          await this.requestNextAction(BLEMessageType.Measure)
          await sleep(1000)
          this.onStartScale(data, this.profileInfo)
          return
        case BLEMessageType.Measure:
          await this.requestNextAction(BLEMessageType.RetrieveMeasurementCount)
          return
        case BLEMessageType.RetrieveMeasurementCount:
          const count = data.value.length > 9 ? data.value[9] : 0
          if (count > 1) {
            const measures = [
              new BLEMessage(BLEMessageType.Disconnect),
            ]
            for (let i = count; i >= 2; i--) {
              measures.push(new BLEMessage(BLEMessageType.RetrieveMeasurementInfo, i))
            }

            const reqBody = {
              "actions": measures.map(a => a.getAction()),
              "device": this.deviceInfo,
            }

            const measureMessages = await this.httpClient.post("/messages", reqBody)
            this.requestMessages.unshift(...measureMessages.data.data.actions)
            await this.requestNextAction(BLEMessageType.RetrieveMeasurementInfo, true)
            return
          }

          await this.requestNextAction(BLEMessageType.RetrieveMeasurementInfo, true)
          return
        case BLEMessageType.RetrieveMeasurementInfo:
          // skip first message
          const messageRequestExists = this.requestMessages.find(a => a.id === BLEMessageType.RetrieveMeasurementInfo)
          if (messageRequestExists) {
            this.offlineMeasures.push(toHexString(data.value))
            await this.requestNextAction(BLEMessageType.RetrieveMeasurementInfo, true)
            return
          }
          this.state = ManagerState.ScaleDone
          try {
            const metrics = await this.httpClient.post("/measures", {
              "payload": toHexString(data.value),
              "device_id": this.deviceInfo?.ID,
              "profile_id": this.profileInfo?.ID,
              "offline_scale": offlineScale,
              "offline_data": this.offlineMeasures,
            })
            this.listener.onScaleDone(metrics.data.data)
            this.requestNextAction(BLEMessageType.Disconnect)
          } catch (e) {
            this.listener.onError('scale', e)
            return
          }
          return
      }
    })

    if (bond) {
      await this.requestNextAction(BLEMessageType.VerifyUUID)
      return
    }
    await this.requestNextAction(BLEMessageType.WriteDate)
  }

  private async exchangeUserInfo(slot: number, forceOverWriteProfile: boolean) {
    const device = this.receivedMessages.get(BLEMessageType.RetrieveDeviceInfo)
    const user = this.receivedMessages.get(BLEMessageType.RetrieveUserInfo)

    const deviceResponseDecoded = await this.httpClient.post("/devices", {
      data: {
        user_info: toHexString(user),
        device_info: toHexString(device),
        slot: slot,
        profile_id: this.profileInfo?.ID
      },
    })

    this.deviceInfo = deviceResponseDecoded.data.data

    if (!forceOverWriteProfile && this.deviceInfo && this.deviceInfo.user_info_exists) {
      this.listener.onWaitConfirm()
      return
    }
    await this.startScale(slot)
  }

  private async requestNextAction(type: BLEMessageType, needRemove = false) {
    let actionIdx = this.requestMessages.findIndex(a => a.id === type)
    const action = this.requestMessages[actionIdx]

    if (needRemove) {
      this.requestMessages.splice(actionIdx, 1)
    }

    if (action) {
      await this.write(action)
      return
    }

    const actionName = getKeyByValue(BLEMessageType, type)
    this.logger.warn(`not found next action ${actionName}`)
    throw `action ${actionName} not found`
  }

  async startScale(slot: number) {
    try {
      const exchangePayload = {
        user_info: this.profileInfo,
        device_info: this.deviceInfo,
        profile_id: slot,
      }

      const measures = [
        new BLEMessage(BLEMessageType.ExchangeUserInfo, exchangePayload),
        new BLEMessage(BLEMessageType.SaveUUID, this.profileInfo?.uuid),
        new BLEMessage(BLEMessageType.Measure),
        new BLEMessage(BLEMessageType.Disconnect),
        new BLEMessage(BLEMessageType.RetrieveMeasurementCount),
        new BLEMessage(BLEMessageType.RetrieveMeasurementInfo, "1"),
      ]

      const reqBody = {
        "actions": measures.map(a => a.getAction()),
        "device": this.deviceInfo,
      }

      const measureMessages = await this.httpClient.post("/messages", reqBody)
      this.requestMessages.push(...measureMessages.data.data.actions)
      await this.requestNextAction(BLEMessageType.ExchangeUserInfo)
    } catch (e) {
      this.listener.onError('scale', e)
    }
  }

  private onStartScale(data: BLEData, profileInfo: TNTUserInfo) {
    this.listener.onStartScale(data, profileInfo)
    this.state = ManagerState.StartScale
  }
}
