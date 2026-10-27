import { ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Card, Tag } from "antd";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useMessageApi } from "@/shared/hooks";
import { WarehouseProductDetails } from "../types/types";
import { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { productApi } from "@/features/products";
import WarehouseProductForm from "./WarehouseProductForm";

export default function CreateWarehouseProductPage() {
  const navigate = useNavigate();
  const messageApi = useMessageApi();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );

  const goToProducts = () => navigate(ROUTES_PATHS.WAREHOUSE_ADD_PRODUCTS);

  const handleCreate = async (
    values: Omit<WarehouseProductDetails, "id">
  ) => {
    if (!outletId) {
      messageApi.error("Please select an outlet before adding a product");
      throw new Error("No outlet selected");
    }

    try {
      await productApi.createProduct({
        outletId,
        name: values.name,
        sku: values.sku,
        brand: values.brand,
        description: values.description,
        categoryId: values.category || null,
        mrpPrice: values.mrpPrice,
        price: values.price,
        isAddOn: values.isAddOn,
        minUnit: values.minUnit,
        uidMap: values.uidMap,
        customFields: values.customFields,
      });
      messageApi.success("Product added successfully");
      goToProducts();
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "Unable to save the product");
      throw err;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-6">
      <Card
        className="mb-5 !rounded-xl !border-slate-200 shadow-sm"
        styles={{ body: { padding: 0 } }}
      >
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-4">
            <Button
              aria-label="Back to products"
              icon={<ArrowLeftOutlined />}
              onClick={goToProducts}
              className="mt-0.5 shrink-0"
            />
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h1 className="m-0 text-xl font-semibold text-slate-900 sm:text-2xl">
                  Add warehouse product
                </h1>
                <Tag color="blue" className="!m-0">
                  New
                </Tag>
              </div>
              <p className="m-0 max-w-2xl text-sm text-slate-500">
                Create a complete product record for pricing, inventory, and
                warehouse tracking.
              </p>
            </div>
          </div>
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xl text-white shadow-sm sm:flex">
            <PlusOutlined />
          </div>
        </div>
      </Card>

      <WarehouseProductForm
        onCancel={goToProducts}
        onSubmit={handleCreate}
        variant="page"
      />
    </div>
  );
}
