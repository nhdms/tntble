import { Buffer } from "react-native-buffer"
import { PermissionsAndroid, Platform } from "react-native"
import { checkMultiple, PERMISSIONS, request } from "react-native-permissions"

export function toHex(str: string): string {
  let result = ""
  for (let i = 0; i < str.length; i++) {
    result += str.charCodeAt(i).toString(16)
  }
  return result
}

export function getKeyByValue(o: Object, value: string | number) {
  try {
    const indexOfS = Object.values(o).indexOf(value)
    return Object.keys(o)[indexOfS]
  } catch (e) {
    return ""
  }
}

export function sleep(milis: number) {
  return new Promise((r) => {
    setTimeout(() => {
      r(1)
    }, milis)
  })
}

export function hexStringToBuffer(hexString: string) {
  const buf = Buffer.from(hexString, "hex")
  const uintArr = new Uint8Array(buf)
  return Array.from(uintArr)
}

export function toHexString(data: number[] | undefined): string {
  if (!data) {
    return ""
  }
  return Buffer.from(data).toString("hex")
}

type BLEAction = {
  id: number,
  name?: string,
  payload: string,
}

export enum BLEMessageType {
  Disconnect = 1,
  SaveUUID = 2,
  VerifyUUID = 3,
  WriteDate = 16,
  RetrieveDeviceInfo = 32,
  RetrieveUserInfo = 4096,
  ExchangeUserInfo = 4098,
  Measure = 8208,
  RetrieveMeasurementCount = 12288,
  RetrieveMeasurementInfo = 12304,
  Unknown = 0
}

export const BLEResponse = new Map<number, BLEMessageType>([
  [32769, BLEMessageType.Disconnect],
  [36866, BLEMessageType.ExchangeUserInfo],
  [40976, BLEMessageType.Measure],
  [32800, BLEMessageType.RetrieveDeviceInfo],
  [45056, BLEMessageType.RetrieveMeasurementCount],
  [45072, BLEMessageType.RetrieveMeasurementInfo],
  [36864, BLEMessageType.RetrieveUserInfo],
  [32770, BLEMessageType.SaveUUID],
  [32771, BLEMessageType.VerifyUUID],
  [32784, BLEMessageType.WriteDate],
])

export function getBLEMessageType(data: number[]): BLEMessageType {
  if (data.length < 8) {
    return BLEMessageType.Unknown
  }

  const code = (data[6] << 8) + data[7]
  return <BLEMessageType>BLEResponse.get(code)
}

export class BLEMessage {
  private id: number
  private name: string
  private payload: any

  constructor(id: number, payload: any = "0", name: string = "") {
    this.id = id
    this.name = name
    this.payload = payload
  }

  getAction(): BLEAction {
    const payload = this.preparePayload()
    if (this.name.length === 0) {
      this.name = getKeyByValue(BLEMessageType, this.id)
    }

    return {
      id: this.id,
      name: this.name,
      payload: payload,
    }
  }

  private preparePayload(): string {
    switch (typeof this.payload) {
      case "number":
        return toHex(this.payload + "")
      case "string":
        return toHex(this.payload)
      case "undefined":
        return ""
      case "object":
        try {
          return toHex(JSON.stringify(this.payload))
        } catch (e) {
        }
        return ""
      default:
        return ""
    }
  }
}

export async function handlePermission() {
  switch (Platform.OS) {
    case "android":
      await handleAndroidPermissions()
      return
    case "ios":
      await handleIOSPermission()
      return
  }
}

export function isAndroid(): boolean {
  return Platform.OS === "android"
}

export function isIOS() {
  return Platform.OS === "ios"
}

async function handleIOSPermission() {
  const requiredPermissions = [PERMISSIONS.IOS.BLUETOOTH, PERMISSIONS.IOS.LOCATION_ALWAYS, PERMISSIONS.IOS.LOCATION_WHEN_IN_USE]
  const status = await checkMultiple(requiredPermissions)
  for (const perm of requiredPermissions) {
    if (status[perm] && status["ios.permission.BLUETOOTH"] === "granted") {
      continue
    }
    await request(perm)
  }
}

async function handleAndroidPermissions() {
  if (Platform.OS !== "android") {
    return
  }

  if (Platform.Version < 23) {
    return
  }

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ])

    if (result) {
      console.debug(
        "[handleAndroidPermissions] User accepts runtime permissions android 12+",
        result,
      )
      return
    }
    console.error(
      "[handleAndroidPermissions] User refuses runtime permissions android 12+",
    )
    return
  }

  // > 23 and < 31
  const checkResult = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  )
  if (checkResult) {
    console.debug(
      "[handleAndroidPermissions] runtime permission Android <12 already OK",
    )
    return
  }

  const requestResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  )

  if (requestResult) {
    console.debug(
      "[handleAndroidPermissions] User accepts runtime permission android <12",
    )
    return
  }
  console.error(
    "[handleAndroidPermissions] User refuses runtime permission android <12",
  )
  return
}
