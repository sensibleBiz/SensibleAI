import { useEffect, useState, useCallback } from "react";
import { Button, Card, Popconfirm, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Can } from "@/features/access-control";
import { useMessageApi } from "@/shared/hooks";
import { WarehouseProductDetails } from "../types/types";
import { RootState } from "@/app/store";
import {
  PERMISSION_MASTER,
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import { productApi, type PostgresProductDTO } from "@/features/products";
import WarehouseProductFormModal from "./WarehouseProductFormModal";

interface Category {
  id: string;
  name: string;
  description?: string;
  isDeleted?: boolean;
}

const mapPostgresProductToWarehouseProduct = (p: PostgresProductDTO): WarehouseProductDetails => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  category: p.categoryId ?? "",
  brand: p.brand,
  description: p.description,
  mrpPrice: p.mrpPrice,
  price: p.price,
  isAddOn: p.isAddOn,
  minUnit: {
    length: p.minUnit.length,
    width: p.minUnit.width,
    height: p.minUnit.height,
    weight: p.minUnit.weight,
    volume: p.minUnit.volume,
  },
  uidMap: p.uidMap,
  customFields: p.customFields,
  isDeleted: !p.active,
  createdAt: new Date(p.createdAt).getTime(),
  updatedAt: new Date(p.updatedAt).getTime(),
});

export default function WarehouseAddProductsPage() {
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );
  const [products, setProducts] = useState<WarehouseProductDetails[]>([]);
  const [editItem, setEditItem] = useState<WarehouseProductDetails | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const messageApi = useMessageApi();
  const navigate = useNavigate();

  const loadPostgresData = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        productApi.listCategories(outletId),
        productApi.listProducts({ outletId }),
      ]);
      setCategories(catRes.map((c) => ({ id: c.id, name: c.name, description: c.description, isDeleted: !c.active })));
      setProducts(prodRes.items.map(mapPostgresProductToWarehouseProduct));
    } catch (err) {
      console.error("Failed to load PostgreSQL warehouse data:", err);
      messageApi.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [outletId, messageApi]);

  useEffect(() => {
    if (!outletId) return;

    void loadPostgresData();
  }, [outletId, loadPostgresData]);

  const handleSubmit = async (values: Partial<WarehouseProductDetails>) => {
    if (!editItem) return;

    try {
      await productApi.updateProduct(editItem.id, {
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
      messageApi.success("Product updated");
      await loadPostgresData();
      setEditItem(null);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Error saving product"
      );
      throw error;
    }
  };

  const handleDelete = async (record: WarehouseProductDetails) => {
    try {
      await productApi.archiveProduct(record.id, outletId);
      messageApi.success("Product deleted");
      await loadPostgresData();
    } catch {
      messageApi.error("Delete failed");
    }
  };

  const getCategoryName = (categoryId?: string) =>
    categories.find((cat) => cat.id === categoryId)?.name || categoryId || "-";

  return (
    <>
      <Card
        title={<b>Product Master</b>}
        extra={
          <Can permission={PERMISSION_MASTER.CRM_WAREHOUSE_CREATE}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate(ROUTES_PATHS.WAREHOUSE_CREATE_PRODUCT)}
            >
              Add Product
            </Button>
          </Can>
        }
      >
        {products.length === 0 && !loading ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            No products found
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[1150px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Customer Price (MRP)</th>
                  <th className="px-4 py-3">Dealer Price</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">GTIN</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {record.name}
                    </td>
                    <td className="px-4 py-3">
                      <Tag color="purple">{record.sku || "-"}</Tag>
                    </td>
                    <td className="px-4 py-3">
                      <Tag color="purple">{getCategoryName(record.category)}</Tag>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.brand || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Tag color="blue">
                        Rs. {(record.mrpPrice || 0).toLocaleString()}
                      </Tag>
                    </td>
                    <td className="px-4 py-3">
                      <Tag color="green">
                        Rs. {(record.price || 0).toLocaleString()}
                      </Tag>
                    </td>
                    <td className="px-4 py-3">
                      <Tag color={record.isAddOn ? "orange" : "default"}>
                        {record.isAddOn ? "Add On" : "Regular"}
                      </Tag>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.uidMap?.GTIN || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_EDIT}>
                        <Button
                          icon={<EditOutlined />}
                          type="text"
                          onClick={() => setEditItem(record)}
                        />
                      </Can>
                      <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_DELETE}>
                        <Popconfirm
                          title="Are you sure?"
                          onConfirm={() => handleDelete(record)}
                        >
                          <Button danger icon={<DeleteOutlined />} type="text" />
                        </Popconfirm>
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <WarehouseProductFormModal
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        onSubmit={handleSubmit}
        initialValues={editItem}
      />
    </>
  );
}
