import dayjs, { Dayjs } from "dayjs";
import type { SalaryStructureRevision } from "./types";
import { roundMoney, sumValues } from "./utils";

export const normalizeSalaryRevisionDate = (value?: string | Dayjs) => {
  const date = value ? dayjs(value) : dayjs();
  return (date.isValid() ? date : dayjs()).startOf("month").format("YYYY-MM-DD");
};

export const normalizeSalaryRevisionEffectiveDate = (value?: string | Dayjs) => {
  const date = value ? dayjs(value) : dayjs();
  return (date.isValid() ? date : dayjs()).format("YYYY-MM-DD");
};

export const getSalaryStructureRevisionForMonth = (
  revisions: SalaryStructureRevision[],
  payrollDate: Dayjs
) => {
  const payrollMonth = payrollDate.startOf("month");

  return revisions
    .filter(
      (revision) =>
        !dayjs(revision.effectiveFrom).isAfter(payrollMonth, "month")
    )
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
    .pop();
};

export const upsertSalaryStructureRevision = (
  revisions: SalaryStructureRevision[],
  revision: SalaryStructureRevision
) => {
  const existingRevision = revisions.find(
    (item) => item.effectiveFrom === revision.effectiveFrom
  );

  if (
    existingRevision &&
    JSON.stringify(existingRevision.salaryStructure) ===
      JSON.stringify(revision.salaryStructure)
  ) {
    return revisions;
  }

  return [
    ...revisions.filter((item) => item.effectiveFrom !== revision.effectiveFrom),
    revision,
  ].sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
};

export interface SalaryRevisionPeriodSegment {
  revision: SalaryStructureRevision;
  startDate: string;
  endDate: string;
  calendarDays: number;
  weight: number;
}

export const getSalaryRevisionSegmentsForPeriod = (
  revisions: SalaryStructureRevision[],
  payrollYear: number,
  payrollMonth: number
): SalaryRevisionPeriodSegment[] => {
  const periodStart = dayjs(`${payrollYear}-${String(payrollMonth).padStart(2, "0")}-01`);
  const periodEnd = periodStart.endOf("month");
  const monthDays = periodEnd.date();
  const orderedRevisions = [...revisions]
    .map((revision) => ({
      ...revision,
      effectiveFrom: normalizeSalaryRevisionEffectiveDate(revision.effectiveFrom),
      effectiveTo: revision.effectiveTo
        ? normalizeSalaryRevisionEffectiveDate(revision.effectiveTo)
        : undefined,
    }))
    .filter((revision) => !dayjs(revision.effectiveFrom).isAfter(periodEnd, "day"))
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));

  return orderedRevisions.reduce<SalaryRevisionPeriodSegment[]>(
    (segments, revision, index) => {
      const nextRevision = orderedRevisions[index + 1];
      const revisionStart = dayjs(revision.effectiveFrom).isAfter(periodStart)
        ? dayjs(revision.effectiveFrom)
        : periodStart;
      const naturalEnd = nextRevision
        ? dayjs(nextRevision.effectiveFrom).subtract(1, "day")
        : periodEnd;
      const configuredEnd = revision.effectiveTo
        ? dayjs(revision.effectiveTo)
        : naturalEnd;
      const revisionEnd = configuredEnd.isBefore(naturalEnd)
        ? configuredEnd
        : naturalEnd;
      const boundedEnd = revisionEnd.isAfter(periodEnd) ? periodEnd : revisionEnd;

      if (revisionStart.isAfter(boundedEnd, "day")) {
        return segments;
      }

      const calendarDays = boundedEnd.diff(revisionStart, "day") + 1;
      return [
        ...segments,
        {
          revision,
          startDate: revisionStart.format("YYYY-MM-DD"),
          endDate: boundedEnd.format("YYYY-MM-DD"),
          calendarDays,
          weight: roundMoney(calendarDays / monthDays),
        },
      ];
    },
    []
  );
};

export const calculateRetrospectiveRevisionArrears = ({
  oldRevision,
  newRevision,
  affectedMonths,
}: {
  oldRevision: SalaryStructureRevision;
  newRevision: SalaryStructureRevision;
  affectedMonths: number;
}) => {
  const oldMonthlyGross = sumValues(oldRevision.salaryStructure.earnings);
  const newMonthlyGross = sumValues(newRevision.salaryStructure.earnings);

  return roundMoney((newMonthlyGross - oldMonthlyGross) * affectedMonths);
};
