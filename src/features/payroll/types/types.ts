export interface SalaryMaster {
  id?: string;
  userId: string;
  userName?: string;
  empCode?: string;
  designation?: string;
  department?: string;

  monthlySalary: number;
  salaryType: "MONTHLY" | "DAILY" | "HOURLY";

  otAllowed: boolean;
  otRatePerHour: number;

  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  advanceDeduction: number;
  otherDeduction: number;

  isActive: boolean;
  createdAt?: number;
  updatedAt?: number;
}
