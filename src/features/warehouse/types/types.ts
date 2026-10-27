export interface WarehouseProduct {
  id: string;
  name: string;
  mrpPrice: number; //customer
  price: number; //dealer
  isDeleted?: boolean;
  isAddOn?: boolean;
}

export interface WarehouseProductDetails extends WarehouseProduct {
  sku: string;
  description: string;
  category: string;
  brand: string;

  minUnit: {
    length: string;
    width: string;
    height: string;
    weight: string;
    volume: string;
  };

  createdAt: number;   // Unix timestamp
  updatedAt: number;   // Unix timestamp

  customFields: Record<string, unknown>;

  uidMap: {
    GTIN: string;
    ISBN: string | null;
    BatchId: string;
    QRCode: string;
    IMEI: string | null;
    SerialNumber: string | null;
    MACAddress: string | null;
    VIN: string | null;
    RFID: string | null;
  };
}

export interface ShiftDTO {
  id: string;
  shiftId: string;          // e.g. "2026-01-30-1"
  shiftNo: number;          // 1, 2, 3...
  code: number;

  // User & Device
  userId: string;
  deviceId: string;

  // Dates
  dayId: string;            // "YYYY-MM-DD"
  startTime: number;        // timestamp (ms)
  endTime: number;          // timestamp (ms)
  lastBillTime: number;     // timestamp (ms)
  updatedAt: number;        // timestamp (ms)

  // Sales Summary
  billCount: number;
  totalSale: number;
  cashSale: number;
  subTotalBill: number;
  tax: number;
  discount: number;
  roundOff: number;

  // Payment & Amounts
  openingAmt: number;
  cashInHand: number;
  receiveAmtTotal: number;
  customerReciveAmtTotal: number;
  advanceAmtTotal: number;
  expensesAmtTotal: number;
  refoundAmount: number;
  deliveryCharges: number;

  // Status
  inActive: boolean;

  // Payment Breakdown
  paymentJson: ShiftPaymentBreakdown;

  // Raw product sale list (if needed)
  productSaleList?: string;
}

export interface ShiftPaymentBreakdown {
  cash: number;
  credit: number;
  cheque: number;
  digital: number;
  card: number;
  googlepay: number;
  phonepe: number;
  paytm: number;
  upi_qr: number;
  swiggy: number;
  zomato: number;
  other: number;
  loyaltypoint: number;
}
