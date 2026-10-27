import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "../../../config/firebase.js";
import { SOURCE } from "./constants.js";
import { DateTime, getTimestampMillis } from "./dateUtils.js";
import { DEFAULT_TIMEZONE } from "./constants.js";
import { normalizeText } from "./validation.js";
import type { MinopIntegration } from "./integrationService.js";

type ParsedDate = { milliseconds: number; dayId: string; monthId: string; yearId: string };

const findDailyAttendanceDoc = async (
  attendanceCollection: FirebaseFirestore.CollectionReference,
  userId: string,
  dayId: string,
) => {
  const snapshot = await attendanceCollection
    .where("userId", "==", userId)
    .where("dayId", "==", dayId)
    .limit(2)
    .get();
  return snapshot.docs[0] ?? null;
};

export const findAttendanceForPunch = async (params: {
  attendanceCollection: FirebaseFirestore.CollectionReference;
  userId: string;
  parsedDate: ParsedDate;
  mode: string;
  timezone: string;
  policy: { allowCrossMidnightCheckout: boolean; crossMidnightCheckoutMaxHours: number };
}) => {
  const currentDoc = await findDailyAttendanceDoc(
    params.attendanceCollection,
    params.userId,
    params.parsedDate.dayId,
  );
  if (currentDoc || params.mode !== "OUT" || !params.policy.allowCrossMidnightCheckout) {
    return {
      existingDoc: currentDoc,
      attendanceRef: currentDoc ? currentDoc.ref : params.attendanceCollection.doc(),
      dayId: params.parsedDate.dayId,
      crossMidnightCheckout: false,
    };
  }
  const previousDate = DateTime.fromMillis(params.parsedDate.milliseconds, { zone: params.timezone || DEFAULT_TIMEZONE }).minus({ days: 1 });
  const previousDayId = previousDate.toFormat("dd-MM-yyyy");
  const previousDoc = await findDailyAttendanceDoc(params.attendanceCollection, params.userId, previousDayId);
  if (!previousDoc) {
    return {
      existingDoc: null,
      attendanceRef: params.attendanceCollection.doc(),
      dayId: params.parsedDate.dayId,
      crossMidnightCheckout: false,
    };
  }
  const previousAttendance = previousDoc.data() || {};
  const checkInTime = getTimestampMillis(previousAttendance.checkInTime);
  const checkOutTime = getTimestampMillis(previousAttendance.checkOutTime);
  const maxShiftMilliseconds = params.policy.crossMidnightCheckoutMaxHours * 60 * 60 * 1000;
  if (
    checkInTime > 0 &&
    checkOutTime <= 0 &&
    params.parsedDate.milliseconds >= checkInTime &&
    params.parsedDate.milliseconds - checkInTime <= maxShiftMilliseconds
  ) {
    return {
      existingDoc: previousDoc,
      attendanceRef: previousDoc.ref,
      dayId: previousDayId,
      crossMidnightCheckout: true,
    };
  }
  return {
    existingDoc: null,
    attendanceRef: params.attendanceCollection.doc(),
    dayId: params.parsedDate.dayId,
    crossMidnightCheckout: false,
  };
};

const getPunchIdempotencyRef = (
  outletRef: FirebaseFirestore.DocumentReference,
  integration: MinopIntegration,
  txnId: string,
) => outletRef.collection("BIOMETRIC_PUNCHES").doc(`${integration.id}_${normalizeText(txnId)}`);

const getExistingBiometricValue = (attendance: Record<string, unknown>, fieldName: string) => {
  const biometric = attendance.biometric;
  if (biometric && typeof biometric === "object" && (biometric as Record<string, unknown>)[fieldName] != null) {
    return normalizeText((biometric as Record<string, unknown>)[fieldName]);
  }
  return normalizeText(attendance[fieldName]);
};

const getEffectiveBiometricValue = (params: {
  attendance: Record<string, unknown>;
  fieldName: string;
  receivedValue: string;
  receivedPunchApplied: boolean;
}) => {
  const existingValue = getExistingBiometricValue(params.attendance, params.fieldName);
  if (!params.receivedPunchApplied && existingValue) return existingValue;
  return normalizeText(params.receivedValue);
};

const buildBiometricDetails = (params: {
  attendance: Record<string, unknown>;
  mode: string;
  txnId: string;
  dvcId: unknown;
  dvcIP: unknown;
  punchId: string;
  receivedPunchApplied?: boolean;
}) => {
  const receivedPunchApplied = params.receivedPunchApplied ?? true;
  return {
    punchId: getEffectiveBiometricValue({
      attendance: params.attendance,
      fieldName: "punchId",
      receivedValue: String(params.punchId),
      receivedPunchApplied,
    }),
    source: SOURCE,
    txnInId: params.mode === "IN"
      ? getEffectiveBiometricValue({
        attendance: params.attendance,
        fieldName: "txnInId",
        receivedValue: String(params.txnId),
        receivedPunchApplied,
      })
      : getExistingBiometricValue(params.attendance, "txnInId"),
    txnOutId: params.mode === "OUT"
      ? getEffectiveBiometricValue({
        attendance: params.attendance,
        fieldName: "txnOutId",
        receivedValue: String(params.txnId),
        receivedPunchApplied,
      })
      : getExistingBiometricValue(params.attendance, "txnOutId"),
    dvcIP: getEffectiveBiometricValue({
      attendance: params.attendance,
      fieldName: "dvcIP",
      receivedValue: String(params.dvcIP ?? ""),
      receivedPunchApplied,
    }),
    dvcId: getEffectiveBiometricValue({
      attendance: params.attendance,
      fieldName: "dvcId",
      receivedValue: String(params.dvcId ?? ""),
      receivedPunchApplied,
    }),
  };
};

const legacyBiometricDeletes = () => ({
  punchId: FieldValue.delete(),
  source: FieldValue.delete(),
  txnInId: FieldValue.delete(),
  txnOutId: FieldValue.delete(),
  dvcIP: FieldValue.delete(),
  dvcId: FieldValue.delete(),
});

const setPunchIdempotencyDoc = (
  tx: FirebaseFirestore.Transaction,
  punchIdempotencyRef: FirebaseFirestore.DocumentReference,
  params: {
    integration: MinopIntegration;
    normalizedTxnId: string;
    userId: string;
    employeeCode: string;
    outletId: string;
    mode: string;
    parsedDate: ParsedDate;
  },
) => {
  tx.set(punchIdempotencyRef, {
    integrationId: params.integration.id,
    txnId: params.normalizedTxnId,
    userId: params.userId,
    employeeCode: params.employeeCode,
    outletId: params.outletId,
    mode: params.mode,
    punchTime: params.parsedDate.milliseconds,
    processedAt: FieldValue.serverTimestamp(),
  });
};

export const upsertCheckIn = async (params: {
  outletRef: FirebaseFirestore.DocumentReference;
  integration: MinopIntegration;
  attendanceRef: FirebaseFirestore.DocumentReference;
  parsedDate: ParsedDate;
  userId: string;
  userName: string;
  employeeCode: string;
  outletId: string;
  txnId: string;
  dvcId: unknown;
  dvcIP: unknown;
  punchId: string;
}) => {
  const punchIdempotencyRef = getPunchIdempotencyRef(params.outletRef, params.integration, params.txnId);
  const normalizedTxnId = normalizeText(params.txnId);
  const result = await firestore.runTransaction(async (tx) => {
    const punchSnapshot = await tx.get(punchIdempotencyRef);
    if (punchSnapshot.exists) return { duplicate: true as const };
    const attendanceSnapshot = await tx.get(params.attendanceRef);
    const attendanceExists = attendanceSnapshot.exists;
    const existingAttendance = attendanceExists ? attendanceSnapshot.data() || {} : {};
    if (attendanceExists) {
      const existingCheckInTime = getTimestampMillis(existingAttendance.checkInTime);
      const receivedCheckInApplied =
        existingCheckInTime <= 0 || params.parsedDate.milliseconds < existingCheckInTime;
      const nextCheckInTime = receivedCheckInApplied
        ? params.parsedDate.milliseconds
        : existingCheckInTime;
      tx.set(
        params.attendanceRef,
        {
          checkInTime: nextCheckInTime,
          isPresent: true,
          status: true,
          employeeCode: params.employeeCode,
          biometric: buildBiometricDetails({
            attendance: existingAttendance,
            mode: "IN",
            txnId: params.txnId,
            dvcId: params.dvcId,
            dvcIP: params.dvcIP,
            punchId: params.punchId,
            receivedPunchApplied: receivedCheckInApplied,
          }),
          ...legacyBiometricDeletes(),
          lastUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      setPunchIdempotencyDoc(tx, punchIdempotencyRef, {
        integration: params.integration,
        normalizedTxnId,
        userId: params.userId,
        employeeCode: params.employeeCode,
        outletId: params.outletId,
        mode: "IN",
        parsedDate: params.parsedDate,
      });
      return { duplicate: false as const, action: receivedCheckInApplied ? "updated-earliest-check-in" : "retained-earliest-check-in" };
    }
    tx.set(params.attendanceRef, {
      id: params.attendanceRef.id,
      userId: params.userId,
      userName: params.userName,
      employeeCode: params.employeeCode,
      outletId: params.outletId,
      checkInTime: params.parsedDate.milliseconds,
      checkOutTime: 0,
      checkInLocation: "",
      checkOutLocation: "",
      checkInLocationDetails: {},
      checkOutLocationDetails: {},
      createdDate: FieldValue.serverTimestamp(),
      dayId: params.parsedDate.dayId,
      monthId: params.parsedDate.monthId,
      yearId: params.parsedDate.yearId,
      isPresent: true,
      note: "",
      status: true,
      biometric: buildBiometricDetails({
        attendance: {},
        mode: "IN",
        txnId: params.txnId,
        dvcId: params.dvcId,
        dvcIP: params.dvcIP,
        punchId: params.punchId,
      }),
    });
    setPunchIdempotencyDoc(tx, punchIdempotencyRef, {
      integration: params.integration,
      normalizedTxnId,
      userId: params.userId,
      employeeCode: params.employeeCode,
      outletId: params.outletId,
      mode: "IN",
      parsedDate: params.parsedDate,
    });
    return { duplicate: false as const, action: "created-check-in" };
  });
  if (result.duplicate) return { duplicate: true };
  return { duplicate: false, action: result.action };
};

export const upsertCheckOut = async (params: {
  outletRef: FirebaseFirestore.DocumentReference;
  integration: MinopIntegration;
  attendanceRef: FirebaseFirestore.DocumentReference;
  parsedDate: ParsedDate;
  userId: string;
  userName: string;
  employeeCode: string;
  outletId: string;
  txnId: string;
  dvcId: unknown;
  dvcIP: unknown;
  punchId: string;
}) => {
  const punchIdempotencyRef = getPunchIdempotencyRef(params.outletRef, params.integration, params.txnId);
  const normalizedTxnId = normalizeText(params.txnId);
  const result = await firestore.runTransaction(async (tx) => {
    const punchSnapshot = await tx.get(punchIdempotencyRef);
    if (punchSnapshot.exists) return { duplicate: true as const };
    const attendanceSnapshot = await tx.get(params.attendanceRef);
    const attendanceExists = attendanceSnapshot.exists;
    const existingAttendance = attendanceExists ? attendanceSnapshot.data() || {} : {};
    if (attendanceExists) {
      const existingCheckOutTime = getTimestampMillis(existingAttendance.checkOutTime);
      const receivedCheckOutApplied =
        existingCheckOutTime <= 0 || params.parsedDate.milliseconds > existingCheckOutTime;
      const nextCheckOutTime = receivedCheckOutApplied
        ? params.parsedDate.milliseconds
        : existingCheckOutTime;
      tx.set(
        params.attendanceRef,
        {
          checkOutTime: nextCheckOutTime,
          status: true,
          employeeCode: params.employeeCode,
          biometric: buildBiometricDetails({
            attendance: existingAttendance,
            mode: "OUT",
            txnId: params.txnId,
            dvcId: params.dvcId,
            dvcIP: params.dvcIP,
            punchId: params.punchId,
            receivedPunchApplied: receivedCheckOutApplied,
          }),
          ...legacyBiometricDeletes(),
          lastUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      setPunchIdempotencyDoc(tx, punchIdempotencyRef, {
        integration: params.integration,
        normalizedTxnId,
        userId: params.userId,
        employeeCode: params.employeeCode,
        outletId: params.outletId,
        mode: "OUT",
        parsedDate: params.parsedDate,
      });
      return { duplicate: false as const, action: receivedCheckOutApplied ? "updated-latest-check-out" : "retained-latest-check-out" };
    }
    tx.set(params.attendanceRef, {
      id: params.attendanceRef.id,
      userId: params.userId,
      userName: params.userName,
      employeeCode: params.employeeCode,
      outletId: params.outletId,
      checkInTime: 0,
      checkOutTime: params.parsedDate.milliseconds,
      checkInLocation: "",
      checkOutLocation: "",
      checkInLocationDetails: {},
      checkOutLocationDetails: {},
      createdDate: FieldValue.serverTimestamp(),
      dayId: params.parsedDate.dayId,
      monthId: params.parsedDate.monthId,
      yearId: params.parsedDate.yearId,
      isPresent: true,
      note: "Checkout received without check-in",
      status: true,
      biometric: buildBiometricDetails({
        attendance: {},
        mode: "OUT",
        txnId: params.txnId,
        dvcId: params.dvcId,
        dvcIP: params.dvcIP,
        punchId: params.punchId,
      }),
    });
    setPunchIdempotencyDoc(tx, punchIdempotencyRef, {
      integration: params.integration,
      normalizedTxnId,
      userId: params.userId,
      employeeCode: params.employeeCode,
      outletId: params.outletId,
      mode: "OUT",
      parsedDate: params.parsedDate,
    });
    return { duplicate: false as const, action: "created-check-out" };
  });
  if (result.duplicate) return { duplicate: true };
  return { duplicate: false, action: result.action };
};
