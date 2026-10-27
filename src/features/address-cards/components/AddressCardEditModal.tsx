import { useState } from "react";
import { Input, Modal } from "antd";
import type { AddressCardSettings, AddressRecord } from "./types";
import { getAddressCardContent } from "@/features/address-cards/utils/addressCards";

interface AddressCardEditModalProps {
  address: AddressRecord;
  settings: AddressCardSettings;
  onCancel: () => void;
  onSave: (address: AddressRecord) => void;
}

export default function AddressCardEditModal({
  address,
  settings,
  onCancel,
  onSave,
}: AddressCardEditModalProps) {
  const content = getAddressCardContent(address, settings);
  const [companyName, setCompanyName] = useState(content.companyName);
  const [fullAddress, setFullAddress] = useState(content.address);
  const [mobile, setMobile] = useState(address.mobile);

  const handleSave = () => {
    const companyField = address.company.trim() ? "company" : "name";

    onSave({
      ...address,
      [companyField]: companyName.trim(),
      fullAddress: fullAddress.trim(),
      mobile: mobile.trim(),
    });
  };

  return (
    <Modal
      open
      centered
      title="Edit address card"
      okText="Save changes"
      cancelText="Cancel"
      onCancel={onCancel}
      onOk={handleSave}
    >
      <div className="grid gap-4 pt-3">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Company name
          <Input
            value={companyName}
            maxLength={120}
            placeholder="Company or recipient name"
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Address
          <Input.TextArea
            value={fullAddress}
            rows={4}
            maxLength={500}
            placeholder="Full postal address"
            onChange={(event) => setFullAddress(event.target.value)}
          />
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Phone number
          <Input
            value={mobile}
            maxLength={24}
            placeholder="Phone number"
            onChange={(event) => setMobile(event.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}
