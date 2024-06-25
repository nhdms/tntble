import {BleError, Device, Device as Peripheral, State} from "react-native-ble-plx"
import {TNTUserInfo} from "./tnt";

export type BLERequest = {
  delayInMilis?: number | undefined
  id: number,
  service_id: string,
  characteristic_id: string,
  payload: string[],
  name: string,
  withResponse: boolean,
  uuid: string
}

export enum ManagerState {
  Initialized = 5,
  Scanning = 10,
  Connecting = 15,
  Connected = 20,
  StartScale = 25,
  ScaleDone = 30,
  Disconnect = 100, // do not handle disconnect
}

export type BLECallback = (data: BLEData) => void

export interface BLEPeripheral {
  init(): Promise<void>

  stopScan(): Promise<void>

  scan(secondToScan: number, name: string, address: string): Promise<void>

  connect(device: string, onData: BLECallback | undefined): Promise<void>

  write(request: BLERequest): Promise<void>

  connectAndScale(device: Device, profile: TNTUserInfo, slot: number, bond: boolean, forceOverwriteProfile: boolean): Promise<void>

  onClose(): Promise<void>

  startScale(slot: number): Promise<void>

  getProfile(): TNTUserInfo

  getState(): ManagerState
}

export type BLEData = {
  value: number[],
  characteristic: string,
  service: string,
  writeRequest?: BLERequest
}

export interface BLEListener {
  onStopScan({status, isTimeout}: { status: number, isTimeout: boolean }): void

  onStateUpdate(newState: State): void

  onDiscover(peripheral: Peripheral): void

  onData(err: BleError | null, data: BLEData | null): void

  onConnect({peripheralId}: { peripheralId: string }): void

  onDisconnect(error: BleError | null): void

  onClose(): void

  onStartScale(data: BLEData, uuid: TNTUserInfo): void

  onScaleDone(data: any): void

  onWaitConfirm(): void;

  onError(location: string, e: any): void;
}
