import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  Card,
  Popconfirm,
  Space,
  Input,
  Tag,
  Tooltip,
  Select,
  Empty,
  Spin,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Sparkles,
  LayoutGrid,
  List,
  Share2,
  Check,
  ArrowUpDown,
  Package,
} from "lucide-react";

import ProductFormModal from "./ProductFormModal";

import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { ProductItem } from "../types/types";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import { Can } from "@/features/access-control";
import {
  productApi,
  type PostgresProductDTO,
  type PostgresCategoryDTO,
} from "../api/productApi";
import {
  CrmPageHeader,
  CrmStatusBadge,
} from "@/shared/components/ui";

type ProductFormValues = Omit<ProductItem, "id">;

const mapPostgresProductToItem = (p: PostgresProductDTO): ProductItem => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  brand: p.brand,
  categoryId: p.categoryId,
  categoryName: p.categoryName,
  description: p.description,
  mrpPrice: p.mrpPrice,
  price: p.price,
  purchasePrice: p.purchasePrice,
  taxPercent: p.taxPercent,
  isAddOn: p.isAddOn,
  active: p.active,
  isDeleted: !p.active,
  minUnit: p.minUnit,
  uidMap: p.uidMap,
  customFields: (p.customFields as ProductItem["customFields"]) || {},
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export default function ProductsPage() {
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<PostgresCategoryDTO[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<ProductItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "regular" | "addon">("all");
  const [sortBy, setSortBy] = useState<"name" | "price_low" | "price_high" | "margin">("name");
  const [copiedPitchId, setCopiedPitchId] = useState<string | null>(null);

  const messageApi = useMessageApi();

  const loadPostgresProducts = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const [resProducts, resCategories] = await Promise.all([
        productApi.listProducts({ outletId, limit: 100 }),
        productApi.listCategories(outletId).catch(() => []),
      ]);
      setProducts(resProducts.items.map(mapPostgresProductToItem));
      setCategories(resCategories);
    } catch (error) {
      console.error("Failed to load PostgreSQL products:", error);
      messageApi.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [outletId, messageApi]);

  useEffect(() => {
    if (!outletId) return;
    void loadPostgresProducts();
  }, [outletId, loadPostgresProducts]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    products.forEach((p) => {
      const catKey = p.categoryId || "uncategorized";
      counts[catKey] = (counts[catKey] || 0) + 1;
    });
    return counts;
  }, [products]);

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Search
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== "all") {
      if (selectedCategory === "uncategorized") {
        result = result.filter((p) => !p.categoryId);
      } else {
        result = result.filter((p) => p.categoryId === selectedCategory);
      }
    }

    // Type filter
    if (typeFilter === "addon") {
      result = result.filter((p) => p.isAddOn);
    } else if (typeFilter === "regular") {
      result = result.filter((p) => !p.isAddOn);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "price_low") return a.price - b.price;
      if (sortBy === "price_high") return b.price - a.price;
      if (sortBy === "margin") {
        const marginA = a.purchasePrice ? ((a.price - a.purchasePrice) / a.price) : 0;
        const marginB = b.purchasePrice ? ((b.price - b.purchasePrice) / b.price) : 0;
        return marginB - marginA;
      }
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [products, searchText, selectedCategory, typeFilter, sortBy]);

  // Add or Update Product
  const handleSubmit = async (values: ProductFormValues) => {
    try {
      if (editItem) {
        await productApi.updateProduct(editItem.id, {
          outletId,
          name: values.name,
          sku: values.sku,
          brand: values.brand,
          categoryId: values.categoryId,
          description: values.description,
          mrpPrice: values.mrpPrice,
          price: values.price,
          purchasePrice: values.purchasePrice,
          taxPercent: values.taxPercent,
          isAddOn: values.isAddOn,
          minUnit: values.minUnit,
          customFields: values.customFields,
        });
        messageApi.success("Product updated successfully");
      } else {
        await productApi.createProduct({
          outletId,
          name: values.name,
          sku: values.sku,
          brand: values.brand,
          categoryId: values.categoryId,
          description: values.description,
          mrpPrice: values.mrpPrice,
          price: values.price,
          purchasePrice: values.purchasePrice,
          taxPercent: values.taxPercent,
          isAddOn: values.isAddOn,
          minUnit: values.minUnit,
          customFields: values.customFields,
        });
        messageApi.success("Product added to catalogue");
      }
      await loadPostgresProducts();
      setEditItem(null);
      setModalOpen(false);
    } catch {
      messageApi.error("Error saving product");
    }
  };

  // Delete
  const handleDelete = async (record: ProductItem) => {
    try {
      await productApi.archiveProduct(record.id, outletId);
      messageApi.success("Product deleted");
      await loadPostgresProducts();
    } catch {
      messageApi.error("Delete failed");
    }
  };

  // Copy WhatsApp Pitch
  const handleCopyPitch = (product: ProductItem) => {
    const cf = product.customFields || {};
    const pitch =
      cf.whatsappPitch ||
      `🌟 *${product.name}*\n\n${product.description || ""}\n\n💰 *Special Price:* ₹${Number(product.price).toLocaleString("en-IN")}\n(MRP: ₹${Number(product.mrpPrice).toLocaleString("en-IN")})`;

    navigator.clipboard.writeText(pitch);
    setCopiedPitchId(product.id);
    messageApi.success("WhatsApp pitch copied to clipboard!");
    setTimeout(() => setCopiedPitchId(null), 2500);
  };

  // Table Columns for Table View
  const columns = [
    {
      title: "Product",
      dataIndex: "name",
      key: "name",
      render: (_: unknown, record: ProductItem) => {
        const primaryImg = record.customFields?.images?.[0]?.url;
        return (
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 flex-shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
              {primaryImg ? (
                <img
                  src={primaryImg}
                  alt={record.name}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <Package size={18} className="text-slate-400" />
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">{record.name}</div>
              <div className="text-xs text-slate-500">
                {record.sku ? `SKU: ${record.sku}` : record.brand || "No SKU"}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      title: "Category",
      dataIndex: "categoryId",
      key: "categoryId",
      render: (_: unknown, record: ProductItem) => {
        const cat = categories.find((c) => c.id === record.categoryId);
        return (
          <Tag color="geekblue" className="rounded-md font-medium text-xs">
            {cat ? cat.name : "Uncategorized"}
          </Tag>
        );
      },
    },
    {
      title: "Customer MRP",
      dataIndex: "mrpPrice",
      key: "mrpPrice",
      render: (v: number) => (
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          ₹ {Number(v).toLocaleString("en-IN")}
        </span>
      ),
    },
    {
      title: "Dealer Price",
      dataIndex: "price",
      key: "price",
      render: (v: number, record: ProductItem) => {
        const margin =
          record.purchasePrice && record.purchasePrice > 0
            ? Math.round(((v - record.purchasePrice) / v) * 100)
            : null;

        return (
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              ₹ {Number(v).toLocaleString("en-IN")}
            </span>
            {margin !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                {margin}%
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: "Tax / HSN",
      key: "tax",
      render: (_: unknown, record: ProductItem) => (
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <div>{record.taxPercent ?? 18}% GST</div>
          {record.customFields?.hsnCode && (
            <div className="text-[11px] text-slate-400">HSN: {record.customFields.hsnCode}</div>
          )}
        </div>
      ),
    },
    {
      title: "Type",
      dataIndex: "isAddOn",
      key: "isAddOn",
      render: (v: boolean) => (
        <CrmStatusBadge tone={v ? "primary" : "neutral"}>
          {v ? "Add On" : "Regular"}
        </CrmStatusBadge>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 140,
      render: (_: unknown, record: ProductItem) => (
        <Space size="small">
          <Tooltip title="Copy WhatsApp Pitch">
            <Button
              type="text"
              size="small"
              icon={
                copiedPitchId === record.id ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Share2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                )
              }
              onClick={() => handleCopyPitch(record)}
            />
          </Tooltip>

          <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_EDIT}>
            <Button
              icon={<EditOutlined />}
              type="text"
              size="small"
              onClick={() => {
                setEditItem(record);
                setModalOpen(true);
              }}
            />
          </Can>

          <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_DELETE}>
            <Popconfirm
              title="Delete this product from catalogue?"
              onConfirm={() => handleDelete(record)}
            >
              <Button danger icon={<DeleteOutlined />} type="text" size="small" />
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <div className="products-page space-y-5">
      {/* 🧭 Executive Header */}
      <CrmPageHeader
        title="Product & Service Catalogue"
        subtitle="AI-assisted commercial catalog with real-time margins, category taxonomy, and WhatsApp collaterals"
        extra={
          <div className="flex items-center gap-2.5">
            {/* View Switcher */}
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <LayoutGrid size={14} /> Showroom Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                <List size={14} /> Table View
              </button>
            </div>

            <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_CREATE}>
              <Button
                type="primary"
                icon={<Sparkles size={14} className="mr-1 inline" />}
                className="bg-indigo-600 hover:bg-indigo-700 flex items-center font-medium shadow-sm"
                onClick={() => {
                  setEditItem(null);
                  setModalOpen(true);
                }}
              >
                AI Add Product
              </Button>
            </Can>
          </div>
        }
      />

      {/* 🏷️ Interactive Category Filter Chips Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
            selectedCategory === "all"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300"
          }`}
        >
          All Items ({categoryCounts.all || 0})
        </button>

        {categories.map((cat) => {
          const count = categoryCounts[cat.id] || 0;
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                isSelected
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300"
              }`}
            >
              {cat.name} ({count})
            </button>
          );
        })}

        {categoryCounts.uncategorized ? (
          <button
            type="button"
            onClick={() => setSelectedCategory("uncategorized")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
              selectedCategory === "uncategorized"
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            Uncategorized ({categoryCounts.uncategorized})
          </button>
        ) : null}
      </div>

      {/* 🔍 Search & Control Bar */}
      <Card className="rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <Input
              placeholder="Search product name, brand, SKU..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full sm:w-72 rounded-lg"
              allowClear
            />

            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-36"
              options={[
                { label: "All Types", value: "all" },
                { label: "Regular Products", value: "regular" },
                { label: "Add-On Products", value: "addon" },
              ]}
            />

            <Select
              value={sortBy}
              onChange={setSortBy}
              className="w-44"
              suffixIcon={<ArrowUpDown size={13} className="text-slate-400" />}
              options={[
                { label: "Sort: Name (A-Z)", value: "name" },
                { label: "Price: Low to High", value: "price_low" },
                { label: "Price: High to Low", value: "price_high" },
                { label: "Highest Margin", value: "margin" },
              ]}
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{filteredProducts.length}</span> of {products.length} products
          </div>
        </div>
      </Card>

      {/* 📦 Catalogue Content */}
      {loading ? (
        <div className="py-24 text-center">
          <Spin size="large" />
          <p className="mt-3 text-xs text-slate-500">Loading product catalogue...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <Card className="rounded-xl border-dashed border-slate-300 dark:border-slate-800 text-center py-12">
          <Empty
            description={
              <span>
                No products found matching your search criteria.
              </span>
            }
          >
            <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_CREATE}>
              <Button
                type="primary"
                icon={<Sparkles size={14} className="mr-1 inline" />}
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={() => {
                  setEditItem(null);
                  setModalOpen(true);
                }}
              >
                Create Product with AI
              </Button>
            </Can>
          </Empty>
        </Card>
      ) : viewMode === "grid" ? (
        /* 🖼️ Visual Showroom Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredProducts.map((product) => {
            const primaryImg = product.customFields?.images?.[0]?.url;
            const categoryObj = categories.find((c) => c.id === product.categoryId);
            const margin =
              product.purchasePrice && product.purchasePrice > 0
                ? Math.round(((product.price - product.purchasePrice) / product.price) * 100)
                : null;
            const features = product.customFields?.features || [];

            return (
              <Card
                key={product.id}
                hoverable
                className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all hover:shadow-md dark:bg-slate-900/60"
                bodyStyle={{ padding: "14px", display: "flex", flexDirection: "column", height: "100%" }}
              >
                {/* Media Thumbnail */}
                <div className="relative mb-3 h-44 w-full rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-100 dark:border-slate-800/80">
                  {primaryImg ? (
                    <img
                      src={primaryImg}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Package size={36} className="stroke-1 mb-1" />
                      <span className="text-[11px] font-medium text-slate-400">No Image</span>
                    </div>
                  )}

                  {/* Badges on Image */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {categoryObj && (
                      <span className="rounded-md bg-slate-900/80 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 shadow-sm">
                        {categoryObj.name}
                      </span>
                    )}
                    {product.isAddOn && (
                      <span className="rounded-md bg-purple-600/90 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 shadow-sm">
                        Add-On
                      </span>
                    )}
                  </div>

                  {product.brand && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-slate-700 dark:text-slate-300 text-[10px] font-medium px-2 py-0.5 border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
                      {product.brand}
                    </span>
                  )}
                </div>

                {/* Product Title & SKU */}
                <div className="mb-2">
                  <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 line-clamp-1" title={product.name}>
                    {product.name}
                  </h3>
                  {product.sku && (
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      SKU: {product.sku}
                    </span>
                  )}
                </div>

                {/* Features Snippet */}
                {features.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {features.slice(0, 2).map((feat, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">
                        <span className="h-1 w-1 rounded-full bg-blue-500 flex-shrink-0" />
                        <span className="truncate">{feat}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pricing & Margin Box */}
                <div className="mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-baseline justify-between mb-1">
                    <div>
                      <span className="text-[11px] text-slate-500">Dealer Price</span>
                      <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        ₹ {Number(product.price).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-500">Customer MRP</span>
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 line-through">
                        ₹ {Number(product.mrpPrice).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-3">
                    <span>
                      {product.taxPercent ?? 18}% GST
                      {product.customFields?.hsnCode && ` • HSN ${product.customFields.hsnCode}`}
                    </span>
                    {margin !== null && (
                      <Tag color="green" className="m-0 text-[10px] px-1.5 py-0 font-medium">
                        {margin}% Margin
                      </Tag>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-1 border-t pt-2 border-slate-100 dark:border-slate-800/80">
                    <Tooltip title="Copy WhatsApp Pitch">
                      <Button
                        size="small"
                        icon={
                          copiedPitchId === product.id ? (
                            <Check size={13} className="text-emerald-500" />
                          ) : (
                            <Share2 size={13} />
                          )
                        }
                        onClick={() => handleCopyPitch(product)}
                        className="text-xs flex items-center gap-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                      >
                        {copiedPitchId === product.id ? "Copied" : "WhatsApp"}
                      </Button>
                    </Tooltip>

                    <div className="flex items-center gap-1">
                      <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_EDIT}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => {
                            setEditItem(product);
                            setModalOpen(true);
                          }}
                        />
                      </Can>

                      <Can permission={PERMISSION_MASTER.CRM_PRODUCTS_DELETE}>
                        <Popconfirm
                          title="Delete this product from catalogue?"
                          onConfirm={() => handleDelete(product)}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Can>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* 📊 High-Density Table View */
        <Card className="rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden p-0">
          <Table
            dataSource={filteredProducts}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 12, showSizeChanger: true }}
            className="pro-products-table"
          />
        </Card>
      )}

      {/* 🛠️ Product Modal */}
      <ProductFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditItem(null);
        }}
        onSubmit={handleSubmit}
        initialValues={editItem}
        categories={categories}
        outletId={outletId}
      />
    </div>
  );
}
