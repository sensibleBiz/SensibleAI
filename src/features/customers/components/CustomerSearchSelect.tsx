import { Select, Spin, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerRecord } from "../types/types";
import type { LeadsManagement } from "@/features/leads";
import { customerApi } from "../api/customerApi";
import { toTitleCase } from "@/shared/utils/helperFunctions";

const { Text } = Typography;

interface CustomerSearchSelectProps {
  outletId: string;
  selectedCustomer: CustomerRecord | null;
  onSelect: (customer: CustomerRecord | null) => void;
  onEnquirySelect: (enquiry: LeadsManagement) => void;
}

export default function CustomerSearchSelect({
  outletId,
  selectedCustomer,
  onSelect,
  onEnquirySelect,
}: CustomerSearchSelectProps) {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [enquiries, setEnquiries] = useState<LeadsManagement[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const activeOutletRef = useRef(outletId);
  activeOutletRef.current = outletId;

  const cancelPendingSearch = useCallback(() => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    request.current?.abort();
  }, []);

  useEffect(() => cancelPendingSearch, [cancelPendingSearch]);

  useEffect(() => {
    cancelPendingSearch();
    setCustomers([]);
    setEnquiries([]);
    setSearchTerm("");
    setSearchError("");
    setSearching(false);
  }, [cancelPendingSearch, outletId]);

  const handleSearch = useCallback(
    (value: string) => {
      const query = value.trim();
      setSearchTerm(query);
      setSearchError("");
      cancelPendingSearch();

      if (query.length < 2 || !outletId) {
        setCustomers([]);
        setEnquiries([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      timer.current = window.setTimeout(() => {
        const abortController = new AbortController();
        request.current = abortController;
        void customerApi
          .search(outletId, query, abortController.signal)
          .then((result) => {
            if (activeOutletRef.current !== outletId) return;
            setCustomers(
              result.items.filter(
                (customer) =>
                  !customer.outletId || customer.outletId === outletId,
              ),
            );
            setEnquiries(result.existingEnquiries ?? []);
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            if (activeOutletRef.current !== outletId) return;
            setCustomers([]);
            setEnquiries([]);
            setSearchError("Customer search could not be completed.");
          })
          .finally(() => {
            if (!abortController.signal.aborted) setSearching(false);
          });
      }, 400);
    },
    [cancelPendingSearch, outletId],
  );

  const notFoundContent = searching ? (
    <Spin size="small" />
  ) : searchError ? (
    <Text type="danger">{searchError}</Text>
  ) : searchTerm.length >= 2 ? (
    <Text type="secondary">
      No existing customer found. Continue below to create a new lead.
    </Text>
  ) : (
    <Text type="secondary">Enter at least 2 characters.</Text>
  );

  const visibleCustomers = useMemo(() => {
    if (!selectedCustomer) return customers;
    return [
      selectedCustomer,
      ...customers.filter((customer) => customer.id !== selectedCustomer.id),
    ];
  }, [customers, selectedCustomer]);

  const options = useMemo(
    () => [
      ...visibleCustomers.map((customer) => ({
        value: `customer:${customer.id}`,
        label: (
          <div>
            <div style={{ fontWeight: 600 }}>
              {toTitleCase(
                customer.customerName || customer.businessName,
                "Customer",
              )}
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                Existing customer
              </Text>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {[
                customer.businessName,
                customer.city,
                customer.mobile,
                customer.email,
              ]
                .filter(Boolean)
                .join(" | ")}
              {` | ${customer.totalEnquiries} enquiries | ${customer.totalWon} won`}
            </div>
          </div>
        ),
      })),
      ...enquiries.map((enquiry) => ({
        value: `enquiry:${enquiry.id}`,
        label: (
          <div>
            <div style={{ fontWeight: 600 }}>
              {toTitleCase(
                enquiry.username || enquiry.businessName,
                "Enquiry",
              )}
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                Repeated enquiry
              </Text>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {[
                enquiry.businessName,
                enquiry.city,
                enquiry.mobile || enquiry.phone,
                enquiry.email,
              ]
                .filter(Boolean)
                .join(" | ")}
            </div>
          </div>
        ),
      })),
    ],
    [enquiries, visibleCustomers],
  );

  return (
    <Select
      allowClear
      showSearch
      filterOption={false}
      placeholder="Business name, mobile, or email"
      style={{ width: "100%" }}
      value={
        selectedCustomer ? `customer:${selectedCustomer.id}` : undefined
      }
      loading={searching}
      notFoundContent={notFoundContent}
      onSearch={handleSearch}
      onClear={() => onSelect(null)}
      onChange={(value) => {
        if (value?.startsWith("enquiry:")) {
          const enquiryId = value.slice("enquiry:".length);
          const enquiry = enquiries.find((item) => item.id === enquiryId);
          if (!enquiry) return;
          const linkedCustomer = enquiry.customerId
            ? visibleCustomers.find(
                (customer) => customer.id === enquiry.customerId,
              )
            : undefined;
          if (linkedCustomer) {
            onSelect(linkedCustomer);
          } else {
            onEnquirySelect(enquiry);
          }
          return;
        }
        const customerId = value?.startsWith("customer:")
          ? value.slice("customer:".length)
          : "";
        onSelect(
          visibleCustomers.find((customer) => customer.id === customerId) ?? null,
        );
      }}
      options={options}
    />
  );
}
