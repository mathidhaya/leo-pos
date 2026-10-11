import type { Customer, CustomerList, CustomerOrderList, CustomerSort } from "../types/customers";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface CustomerPayload {
  name: string;
  phone: string;
  email: string;
  address: string;
}

export interface CustomerListParams {
  q?: string;
  sort: CustomerSort;
  page: number;
  pageSize: number;
}

export async function listCustomers(params: CustomerListParams): Promise<CustomerList> {
  const res = await api.get<Envelope<CustomerList>>("/customers", { params });
  return res.data.data;
}

export async function getCustomer(id: string): Promise<Customer> {
  const res = await api.get<Envelope<Customer>>(`/customers/${id}`);
  return res.data.data;
}

export async function listCustomerOrders(id: string, page: number, pageSize: number): Promise<CustomerOrderList> {
  const res = await api.get<Envelope<CustomerOrderList>>(`/customers/${id}/orders`, { params: { page, pageSize } });
  return res.data.data;
}

export async function createCustomer(payload: CustomerPayload): Promise<Customer> {
  const res = await api.post<Envelope<Customer>>("/customers", payload);
  return res.data.data;
}

export async function updateCustomer(id: string, payload: CustomerPayload): Promise<Customer> {
  const res = await api.put<Envelope<Customer>>(`/customers/${id}`, payload);
  return res.data.data;
}

export async function deleteCustomer(id: string): Promise<{ ordersKept: number }> {
  const res = await api.delete<Envelope<{ message: string; ordersKept: number }>>(`/customers/${id}`);
  return { ordersKept: res.data.data.ordersKept };
}
