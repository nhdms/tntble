import { Buffer } from "buffer"

export const base64ToHexString = (base64String: string) => {
  const buffer = Buffer.from(base64String, "base64")
  return buffer.toString("hex")
}
export const hexStringToBase64 = (hexString: string) => {
  const buffer = Buffer.from(hexString, "hex")
  return buffer.toString("base64")
}
