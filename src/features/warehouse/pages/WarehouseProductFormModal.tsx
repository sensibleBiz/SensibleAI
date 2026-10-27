import { Modal } from "antd";
import { WarehouseProductDetails } from "../types/types";
import WarehouseProductForm from "./WarehouseProductForm";

interface WarehouseProductFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    values: Omit<WarehouseProductDetails, "id">
  ) => void | Promise<void>;
  initialValues?: WarehouseProductDetails | null;
}

export default function WarehouseProductFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
}: WarehouseProductFormModalProps) {
  return (
    <Modal
      title="Edit warehouse product"
      centered
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnHidden
      styles={{ body: { maxHeight: "76vh", overflowY: "auto" } }}
    >
      <WarehouseProductForm
        enabled={open}
        initialValues={initialValues}
        onCancel={onClose}
        onSubmit={onSubmit}
        variant="modal"
      />
    </Modal>
  );
}
