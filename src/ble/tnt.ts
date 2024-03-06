/**
 *  TNTUserInfo = {
 *   nickname: "nick",
 *   height: "184",
 *   dob: "2000-06-25T00:00:00Z",
 *   calendar: string,
 *   gender: 1,
 *   tare: "0.1",
 * }
 */

export type TNTUserInfo = {
  ID?: number,
  nickname: string,
  height: string,
  dob: string,
  calendar: string,
  gender: number,
  tare: string,
  uuid?: string,
  slot?: number
}

export type TNTDeviceInfo = {
  ID: number,
  user_info_exists: boolean
}
