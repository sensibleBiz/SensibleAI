import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface CreateCustomerData {
  customer_insert: Customer_Key;
}

export interface CreateCustomerVariables {
  tenantId: UUIDString;
  businessId: UUIDString;
  customerCode: string;
  customerName: string;
  normalizedCustomerName: string;
  createdBy: UUIDString;
}

export interface Customer_Key {
  id: UUIDString;
  __typename?: 'Customer_Key';
}

export interface DeleteCustomerData {
  customer_delete?: Customer_Key | null;
}

export interface DeleteCustomerVariables {
  id: UUIDString;
}

export interface GetCustomerData {
  customer?: {
    id: UUIDString;
    tenantId: UUIDString;
    businessId: UUIDString;
    customerCode: string;
    customerName: string;
    businessName: string;
    mobile?: string | null;
    email?: string | null;
    area: string;
    city: string;
    state: string;
    status: string;
    lifecycle: string;
    totalEnquiries: number;
    totalWon: number;
    totalLost: number;
    createdAt: TimestampString;
    updatedAt: TimestampString;
  } & Customer_Key;
}

export interface GetCustomerVariables {
  id: UUIDString;
}

export interface ListCustomersData {
  customers: ({
    id: UUIDString;
    customerCode: string;
    customerName: string;
    businessName: string;
    mobile?: string | null;
    email?: string | null;
    city: string;
    status: string;
    lifecycle: string;
    updatedAt: TimestampString;
  } & Customer_Key)[];
}

export interface ListCustomersVariables {
  tenantId: UUIDString;
  limit?: number | null;
  offset?: number | null;
}

export interface UpdateCustomerNameData {
  customer_update?: Customer_Key | null;
}

export interface UpdateCustomerNameVariables {
  id: UUIDString;
  customerName: string;
  normalizedCustomerName: string;
  updatedBy: UUIDString;
}

/** Generated Node Admin SDK operation action function for the 'CreateCustomer' Mutation. Allow users to execute without passing in DataConnect. */
export function createCustomer(dc: DataConnect, vars: CreateCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCustomerData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCustomer' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCustomer(vars: CreateCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCustomerData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCustomerName' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCustomerName(dc: DataConnect, vars: UpdateCustomerNameVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCustomerNameData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCustomerName' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCustomerName(vars: UpdateCustomerNameVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCustomerNameData>>;

/** Generated Node Admin SDK operation action function for the 'DeleteCustomer' Mutation. Allow users to execute without passing in DataConnect. */
export function deleteCustomer(dc: DataConnect, vars: DeleteCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteCustomerData>>;
/** Generated Node Admin SDK operation action function for the 'DeleteCustomer' Mutation. Allow users to pass in custom DataConnect instances. */
export function deleteCustomer(vars: DeleteCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<DeleteCustomerData>>;

/** Generated Node Admin SDK operation action function for the 'GetCustomer' Query. Allow users to execute without passing in DataConnect. */
export function getCustomer(dc: DataConnect, vars: GetCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCustomerData>>;
/** Generated Node Admin SDK operation action function for the 'GetCustomer' Query. Allow users to pass in custom DataConnect instances. */
export function getCustomer(vars: GetCustomerVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCustomerData>>;

/** Generated Node Admin SDK operation action function for the 'ListCustomers' Query. Allow users to execute without passing in DataConnect. */
export function listCustomers(dc: DataConnect, vars: ListCustomersVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListCustomersData>>;
/** Generated Node Admin SDK operation action function for the 'ListCustomers' Query. Allow users to pass in custom DataConnect instances. */
export function listCustomers(vars: ListCustomersVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListCustomersData>>;

