import type { AttendanceRecord } from "../types/types";

export const calculateStats = (data: AttendanceRecord[]) => {
  const totalEmployees = new Set(data.map((d) => d.userId)).size
  const presentToday = data.filter((d) => d.isPresent).length
  const absent = data.filter((d) => !d.isPresent).length
  const lateArrivals = data.filter((d) => {
    const checkInDate = new Date(d.checkInTime)
    return checkInDate.getHours() === 9 && checkInDate.getMinutes() > 30
  }).length

  return {
    totalEmployees,
    presentToday,
    absent,
    lateArrivals,
  }
}
