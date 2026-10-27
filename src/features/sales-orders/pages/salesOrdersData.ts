export type SalesOrderStatus =
  | "Draft"
  | "Pending"
  | "Confirmed"
  | "Completed"
  | "Cancelled";

export interface SalesOrder {
  id: string;
  orderDate: string;
  customer: string;
  contact: string;
  email: string;
  items: number;
  totalAmount: number;
  status: SalesOrderStatus;
  salesPerson: string;
}

export interface SalesOrderProduct {
  name: string;
  sku: string;
  rate: number;
  tax: number;
}

export interface SalesOrderLineItem {
  product?: string;
  sku?: string;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
}

export const salesOrderSummary = {
  totalOrders: 128,
  pending: 24,
  confirmed: 76,
  completed: 28,
};

export const salesOrders: SalesOrder[] = [
  {
    id: "SO-10001",
    orderDate: "2026-08-17",
    customer: "ABC Enterprises",
    contact: "9876543210",
    email: "purchase@abcenterprises.in",
    items: 4,
    totalAmount: 45800,
    status: "Confirmed",
    salesPerson: "Rahul",
  },
  {
    id: "SO-10002",
    orderDate: "2026-08-16",
    customer: "Shree Balaji Traders",
    contact: "9822011188",
    email: "orders@balajitraders.in",
    items: 2,
    totalAmount: 23600,
    status: "Pending",
    salesPerson: "Priya",
  },
  {
    id: "SO-10003",
    orderDate: "2026-08-15",
    customer: "Metro Retail Hub",
    contact: "9898981212",
    email: "accounts@metroretail.in",
    items: 6,
    totalAmount: 81250,
    status: "Completed",
    salesPerson: "Amit",
  },
  {
    id: "SO-10004",
    orderDate: "2026-08-14",
    customer: "Green Mart Foods",
    contact: "9811223344",
    email: "billing@greenmart.in",
    items: 3,
    totalAmount: 31450,
    status: "Draft",
    salesPerson: "Neha",
  },
  {
    id: "SO-10005",
    orderDate: "2026-08-12",
    customer: "Noble Pharmacy",
    contact: "9877001122",
    email: "noblepharma@example.com",
    items: 5,
    totalAmount: 60200,
    status: "Cancelled",
    salesPerson: "Rahul",
  },
];

export const salesOrderProducts: SalesOrderProduct[] = [
  { name: "POS Billing Software", sku: "POS-SW-001", rate: 18000, tax: 18 },
  { name: "Thermal Receipt Printer", sku: "TH-PR-002", rate: 7200, tax: 18 },
  { name: "Barcode Scanner", sku: "BC-SC-003", rate: 4200, tax: 18 },
  { name: "Cash Drawer", sku: "CS-DR-004", rate: 5600, tax: 18 },
  { name: "Annual Support Plan", sku: "SUP-AN-005", rate: 9500, tax: 18 },
];

export const defaultSalesOrderItems: SalesOrderLineItem[] = [
  {
    product: "POS Billing Software",
    sku: "POS-SW-001",
    qty: 1,
    rate: 18000,
    discount: 1000,
    tax: 18,
  },
  {
    product: "Thermal Receipt Printer",
    sku: "TH-PR-002",
    qty: 2,
    rate: 7200,
    discount: 0,
    tax: 18,
  },
];
