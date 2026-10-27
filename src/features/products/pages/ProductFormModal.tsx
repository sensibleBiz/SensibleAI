import { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  Switch,
  Typography,
  Tabs,
  Select,
  Tag,
  Divider,
  Upload,
  message,
  Tooltip,
} from "antd";
import {
  Sparkles,
  Camera,
  Copy,
  Check,
  Percent,
  Layers,
  FileText,
  DollarSign,
  Package,
  Share2,
  Plus,
  Trash2,
} from "lucide-react";
import { ProductItem, ProductAiOutput } from "../types/types";
import { productApi } from "../api/productApi";

const { Text } = Typography;
const { TextArea } = Input;

interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: Omit<ProductItem, "id">) => void;
  initialValues?: ProductItem | null;
  categories?: Array<{ id: string; name: string }>;
  outletId?: string;
}

export default function ProductFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  categories = [],
  outletId,
}: ProductFormModalProps) {
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState("overview");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [featuresList, setFeaturesList] = useState<string[]>([]);
  const [newFeatureText, setNewFeatureText] = useState("");
  const [specsList, setSpecsList] = useState<Array<{ key: string; value: string }>>([]);
  const [newSpecKey, setNewSpecKey] = useState("");
  const [newSpecValue, setNewSpecValue] = useState("");
  const [imagesList, setImagesList] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");

  const watchedMrp = Form.useWatch("mrpPrice", form) || 0;
  const watchedDealerPrice = Form.useWatch("price", form) || 0;
  const watchedCostPrice = Form.useWatch("purchasePrice", form) || 0;
  const isAddOn = Form.useWatch("isAddOn", form);

  // Compute live margins
  const dealerMarginPercent =
    watchedDealerPrice > 0 && watchedCostPrice > 0
      ? Math.round(((watchedDealerPrice - watchedCostPrice) / watchedDealerPrice) * 100)
      : null;

  const mrpMarginPercent =
    watchedMrp > 0 && watchedCostPrice > 0
      ? Math.round(((watchedMrp - watchedCostPrice) / watchedMrp) * 100)
      : null;

  useEffect(() => {
    if (open) {
      setActiveTab("overview");
      setAiPrompt("");
      if (initialValues) {
        const cf = initialValues.customFields || {};
        const feats = Array.isArray(cf.features) ? cf.features : [];
        const specs = cf.specifications
          ? Object.entries(cf.specifications).map(([k, v]) => ({ key: k, value: String(v) }))
          : [];
        const imgs = Array.isArray(cf.images) ? cf.images.map((im) => im.url) : [];

        setFeaturesList(feats);
        setSpecsList(specs);
        setImagesList(imgs);

        form.setFieldsValue({
          name: initialValues.name || "",
          sku: initialValues.sku || "",
          brand: initialValues.brand || "",
          categoryId: initialValues.categoryId || undefined,
          description: initialValues.description || "",
          mrpPrice: initialValues.mrpPrice || 0,
          price: initialValues.price || 0,
          purchasePrice: initialValues.purchasePrice || 0,
          taxPercent: initialValues.taxPercent ?? 18,
          isAddOn: initialValues.isAddOn ?? false,
          hsnCode: cf.hsnCode || "",
          unit: cf.unit || "PCS",
          whatsappPitch: cf.whatsappPitch || "",
          tags: cf.tags || [],
          length: initialValues.minUnit?.length || "",
          width: initialValues.minUnit?.width || "",
          height: initialValues.minUnit?.height || "",
          weight: initialValues.minUnit?.weight || "",
        });
      } else {
        form.resetFields();
        setFeaturesList([]);
        setSpecsList([]);
        setImagesList([]);
        form.setFieldsValue({
          taxPercent: 18,
          unit: "PCS",
          isAddOn: false,
          mrpPrice: 0,
          price: 0,
          purchasePrice: 0,
        });
      }
    }
  }, [open, initialValues, form]);

  // Apply AI output to form
  const applyAiOutput = (aiData: ProductAiOutput) => {
    form.setFieldsValue({
      name: aiData.name || form.getFieldValue("name"),
      brand: aiData.brand || form.getFieldValue("brand"),
      description: aiData.description || form.getFieldValue("description"),
      mrpPrice: aiData.suggestedMrp || form.getFieldValue("mrpPrice"),
      price: aiData.suggestedPrice || form.getFieldValue("price"),
      purchasePrice: aiData.suggestedPurchasePrice || form.getFieldValue("purchasePrice"),
      taxPercent: aiData.suggestedGstRate ?? 18,
      hsnCode: aiData.suggestedHsnCode || form.getFieldValue("hsnCode"),
      unit: aiData.suggestedUnit || "PCS",
      whatsappPitch: aiData.whatsappPitch || form.getFieldValue("whatsappPitch"),
      tags: aiData.tags || form.getFieldValue("tags") || [],
    });

    if (aiData.category && categories.length > 0) {
      const matchedCat = categories.find(
        (c) => c.name.toLowerCase() === aiData.category.toLowerCase()
      );
      if (matchedCat) {
        form.setFieldValue("categoryId", matchedCat.id);
      }
    }

    if (Array.isArray(aiData.features) && aiData.features.length > 0) {
      setFeaturesList(aiData.features);
    }

    if (aiData.specifications && Object.keys(aiData.specifications).length > 0) {
      setSpecsList(
        Object.entries(aiData.specifications).map(([k, v]) => ({ key: k, value: String(v) }))
      );
    }

    message.success("✨ AI specifications and copy auto-populated!");
  };

  // Generate with AI
  const handleGenerateAi = async () => {
    const promptText = aiPrompt.trim() || form.getFieldValue("name")?.trim();
    if (!promptText) {
      message.warning("Please enter a product prompt or product name first");
      return;
    }

    setAiLoading(true);
    try {
      const res = await productApi.generateProductAi({
        prompt: promptText,
        name: form.getFieldValue("name"),
        brand: form.getFieldValue("brand"),
        targetPrice: form.getFieldValue("mrpPrice") || undefined,
        outletId,
      });
      applyAiOutput(res);
    } catch (err) {
      console.error("AI Generation error:", err);
      message.error("Failed to generate with AI");
    } finally {
      setAiLoading(false);
    }
  };

  // Image upload and Vision AI scan
  const handleImageVisionScan = async (file: File) => {
    setAiLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        if (!base64) return;

        // Also add to preview images
        if (!imagesList.includes(base64)) {
          setImagesList((prev) => [base64, ...prev]);
        }

        try {
          const res = await productApi.analyzeProductImageAi({
            imageBase64: base64,
            mimeType: file.type || "image/jpeg",
            prompt: aiPrompt || undefined,
            outletId,
          });
          applyAiOutput(res);
        } catch (err) {
          console.error("Vision AI error:", err);
          message.error("Failed to analyze product image");
        } finally {
          setAiLoading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setAiLoading(false);
      message.error("Error reading image file");
    }
    return false; // prevent default upload
  };

  const handleAddFeature = () => {
    if (!newFeatureText.trim()) return;
    setFeaturesList([...featuresList, newFeatureText.trim()]);
    setNewFeatureText("");
  };

  const handleRemoveFeature = (index: number) => {
    setFeaturesList(featuresList.filter((_, i) => i !== index));
  };

  const handleAddSpec = () => {
    if (!newSpecKey.trim() || !newSpecValue.trim()) return;
    setSpecsList([...specsList, { key: newSpecKey.trim(), value: newSpecValue.trim() }]);
    setNewSpecKey("");
    setNewSpecValue("");
  };

  const handleRemoveSpec = (index: number) => {
    setSpecsList(specsList.filter((_, i) => i !== index));
  };

  const handleAddImageUrl = () => {
    if (!newImageUrl.trim()) return;
    setImagesList([...imagesList, newImageUrl.trim()]);
    setNewImageUrl("");
  };

  const handleRemoveImage = (index: number) => {
    setImagesList(imagesList.filter((_, i) => i !== index));
  };

  const copyWhatsAppPitch = () => {
    const pitch = form.getFieldValue("whatsappPitch");
    if (!pitch) return;
    navigator.clipboard.writeText(pitch);
    setCopiedPitch(true);
    message.success("WhatsApp pitch copied to clipboard!");
    setTimeout(() => setCopiedPitch(false), 2000);
  };

  const handleFinish = (values: Record<string, any>) => {
    const specificationsObj: Record<string, string> = {};
    specsList.forEach((s) => {
      if (s.key) specificationsObj[s.key] = s.value;
    });

    const imagesPayload = imagesList.map((url, idx) => ({
      url,
      isPrimary: idx === 0,
      alt: values.name || "Product image",
    }));

    const customFields = {
      ...(initialValues?.customFields || {}),
      images: imagesPayload,
      hsnCode: values.hsnCode || "",
      unit: values.unit || "PCS",
      features: featuresList,
      specifications: specificationsObj,
      whatsappPitch: values.whatsappPitch || "",
      tags: values.tags || [],
      aiMetadata: {
        generatedAt: new Date().toISOString(),
        model: "gemini-3.8-flash",
      },
    };

    const payload: Omit<ProductItem, "id"> = {
      name: values.name,
      sku: values.sku || "",
      brand: values.brand || "",
      categoryId: values.categoryId || null,
      description: values.description || "",
      mrpPrice: Number(values.mrpPrice) || 0,
      price: Number(values.price) || 0,
      purchasePrice: Number(values.purchasePrice) || 0,
      taxPercent: Number(values.taxPercent) || 0,
      isAddOn: Boolean(values.isAddOn),
      minUnit: {
        length: values.length || "",
        width: values.width || "",
        height: values.height || "",
        weight: values.weight || "",
        volume: "",
      },
      customFields,
    };

    onSubmit(payload);
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2 text-base font-semibold">
          <Package size={20} className="text-blue-600 dark:text-blue-400" />
          <span>{initialValues ? "Edit Product Catalogue Entry" : "Create Product with AI Assistance"}</span>
          {initialValues && (
            <Tag color={initialValues.isAddOn ? "purple" : "blue"} className="ml-2 font-normal">
              {initialValues.isAddOn ? "Add-On Product" : "Catalogue Item"}
            </Tag>
          )}
        </div>
      }
      centered
      open={open}
      width={860}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      footer={null}
      destroyOnClose
    >
      {/* ⚡ Top AI Copilot Bar */}
      <div className="mb-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-blue-50/80 p-3.5 dark:border-indigo-900/50 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-blue-950/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
              <Sparkles size={14} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
              AI Smart Catalogue Assistant
            </span>
          </div>
          <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
            Powered by Gemini 3.8 Flash
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onPressEnter={handleGenerateAi}
            placeholder="E.g. Industrial RO Water Purifier 250 LPH with stainless steel frame, 150 PSI..."
            prefix={<Sparkles size={15} className="text-indigo-500 mr-1" />}
            className="flex-1 rounded-lg border-indigo-200 dark:border-indigo-800"
            disabled={aiLoading}
          />
          <Button
            type="primary"
            onClick={handleGenerateAi}
            loading={aiLoading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            Generate Details
          </Button>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={handleImageVisionScan}
          >
            <Tooltip title="Upload product photo or spec sheet label to auto-extract with Vision AI">
              <Button
                icon={<Camera size={15} />}
                loading={aiLoading}
                className="border-indigo-300 dark:border-indigo-700 hover:text-indigo-600 rounded-lg"
              >
                Scan Photo
              </Button>
            </Tooltip>
          </Upload>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        className="product-catalog-form"
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "overview",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  <FileText size={15} /> General Info
                </span>
              ),
              children: (
                <div className="space-y-4 pt-1">
                  <Form.Item
                    label="Product Name"
                    name="name"
                    rules={[{ required: true, message: "Please enter product name" }]}
                  >
                    <Input placeholder="E.g. Sensible 250 LPH Industrial RO Purifier" size="large" />
                  </Form.Item>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="SKU / Item Code" name="sku">
                      <Input placeholder="E.g. RO-IND-250" />
                    </Form.Item>
                    <Form.Item label="Brand" name="brand">
                      <Input placeholder="E.g. SensibleTech" />
                    </Form.Item>
                    <Form.Item label="Category" name="categoryId">
                      <Select
                        placeholder="Select category"
                        allowClear
                        options={categories.map((c) => ({ label: c.name, value: c.id }))}
                      />
                    </Form.Item>
                  </div>

                  <Form.Item label="Commercial Description" name="description">
                    <TextArea
                      rows={3}
                      placeholder="Comprehensive overview highlighting application, materials, and benefits..."
                    />
                  </Form.Item>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">
                      Key Bullet Features
                    </label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newFeatureText}
                        onChange={(e) => setNewFeatureText(e.target.value)}
                        onPressEnter={handleAddFeature}
                        placeholder="Add a key selling feature..."
                      />
                      <Button onClick={handleAddFeature} icon={<Plus size={14} />}>
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {featuresList.map((feat, idx) => (
                        <Tag
                          key={idx}
                          closable
                          onClose={() => handleRemoveFeature(idx)}
                          color="blue"
                          className="py-0.5 px-2 text-xs rounded-md"
                        >
                          {feat}
                        </Tag>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <Form.Item label="Product Tags" name="tags">
                      <Select
                        mode="tags"
                        placeholder="E.g. bestseller, heavy-duty, certified"
                        options={[
                          { label: "Bestseller", value: "bestseller" },
                          { label: "Commercial", value: "commercial" },
                          { label: "High Margin", value: "high-margin" },
                          { label: "New Launch", value: "new-launch" },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Product Classification"
                      name="isAddOn"
                      valuePropName="checked"
                    >
                      <div className="flex items-center gap-3 pt-1">
                        <Switch
                          checked={isAddOn}
                          onChange={(checked) => form.setFieldValue("isAddOn", checked)}
                        />
                        <Text type="secondary" className="text-xs">
                          {isAddOn
                            ? "🟣 Add-On Product (Complementary / Upsell accessory)"
                            : "🔵 Regular Product (Primary catalogue item)"}
                        </Text>
                      </div>
                    </Form.Item>
                  </div>
                </div>
              ),
            },
            {
              key: "pricing",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  <DollarSign size={15} /> Pricing & Taxes
                </span>
              ),
              children: (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item
                      label="Customer Price (MRP)"
                      name="mrpPrice"
                      rules={[{ required: true, message: "Enter customer price" }]}
                    >
                      <InputNumber
                        min={0}
                        prefix="₹"
                        style={{ width: "100%" }}
                        formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Dealer Price"
                      name="price"
                      rules={[{ required: true, message: "Enter dealer price" }]}
                    >
                      <InputNumber
                        min={0}
                        prefix="₹"
                        style={{ width: "100%" }}
                        formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                      />
                    </Form.Item>

                    <Form.Item label="Purchase Cost Price" name="purchasePrice">
                      <InputNumber
                        min={0}
                        prefix="₹"
                        style={{ width: "100%" }}
                        formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                      />
                    </Form.Item>
                  </div>

                  {/* 📊 Live Profit Margin Gauges */}
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Percent size={16} className="text-emerald-500" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Dealer Margin
                        </span>
                      </div>
                      <Tag color={dealerMarginPercent && dealerMarginPercent > 20 ? "green" : "orange"}>
                        {dealerMarginPercent !== null ? `${dealerMarginPercent}%` : "Set cost price"}
                      </Tag>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Percent size={16} className="text-blue-500" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Retail Gross Margin
                        </span>
                      </div>
                      <Tag color={mrpMarginPercent && mrpMarginPercent > 30 ? "blue" : "default"}>
                        {mrpMarginPercent !== null ? `${mrpMarginPercent}%` : "Set cost price"}
                      </Tag>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Form.Item label="HSN / SAC Code" name="hsnCode">
                      <Input placeholder="E.g. 8421" />
                    </Form.Item>

                    <Form.Item label="GST Tax Slab (%)" name="taxPercent">
                      <Select
                        options={[
                          { label: "0% (Exempt)", value: 0 },
                          { label: "5% Standard", value: 5 },
                          { label: "12% Standard", value: 12 },
                          { label: "18% Standard GST", value: 18 },
                          { label: "28% Luxury / Cess", value: 28 },
                        ]}
                      />
                    </Form.Item>

                    <Form.Item label="Unit of Measure" name="unit">
                      <Select
                        options={[
                          { label: "PCS (Pieces)", value: "PCS" },
                          { label: "SET (Sets)", value: "SET" },
                          { label: "BOX (Boxes)", value: "BOX" },
                          { label: "KG (Kilograms)", value: "KG" },
                          { label: "MTR (Meters)", value: "MTR" },
                          { label: "LTR (Liters)", value: "LTR" },
                          { label: "PACK (Packs)", value: "PACK" },
                        ]}
                      />
                    </Form.Item>
                  </div>
                </div>
              ),
            },
            {
              key: "media",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  <Camera size={15} /> Media & Photos
                </span>
              ),
              children: (
                <div className="space-y-4 pt-1">
                  <div className="flex gap-2">
                    <Input
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                      onPressEnter={handleAddImageUrl}
                      placeholder="Paste image URL (https://...)"
                    />
                    <Button onClick={handleAddImageUrl} icon={<Plus size={14} />}>
                      Add Image URL
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {imagesList.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900 group aspect-video flex items-center justify-center"
                      >
                        <img
                          src={url}
                          alt="Product thumbnail"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                        {idx === 0 && (
                          <span className="absolute top-1 left-1 bg-blue-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded shadow">
                            Primary
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {imagesList.length === 0 && (
                    <div className="p-8 text-center border border-dashed rounded-xl border-slate-300 dark:border-slate-700">
                      <Camera size={32} className="mx-auto text-slate-400 mb-2" />
                      <p className="text-xs text-slate-500">
                        No images added yet. Paste image URLs above or use the "Scan Photo" button on the top bar.
                      </p>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "specs",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  <Layers size={15} /> Specs & Dimensions
                </span>
              ),
              children: (
                <div className="space-y-4 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">
                      Technical Specifications Table
                    </label>
                    <div className="flex gap-2 mb-3">
                      <Input
                        value={newSpecKey}
                        onChange={(e) => setNewSpecKey(e.target.value)}
                        placeholder="Spec Name (e.g. Material)"
                        className="w-1/3"
                      />
                      <Input
                        value={newSpecValue}
                        onChange={(e) => setNewSpecValue(e.target.value)}
                        placeholder="Value (e.g. SS304)"
                        className="flex-1"
                        onPressEnter={handleAddSpec}
                      />
                      <Button onClick={handleAddSpec} icon={<Plus size={14} />}>
                        Add
                      </Button>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {specsList.map((spec, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                        >
                          <span className="font-semibold text-slate-700 dark:text-slate-300 w-1/3">
                            {spec.key}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400 flex-1 truncate">
                            {spec.value}
                          </span>
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<Trash2 size={13} />}
                            onClick={() => handleRemoveSpec(idx)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <Divider className="my-2" />

                  <div>
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 block">
                      Physical Package Dimensions & Weight
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Form.Item label="Length" name="length">
                        <Input placeholder="E.g. 50 cm" />
                      </Form.Item>
                      <Form.Item label="Width" name="width">
                        <Input placeholder="E.g. 30 cm" />
                      </Form.Item>
                      <Form.Item label="Height" name="height">
                        <Input placeholder="E.g. 80 cm" />
                      </Form.Item>
                      <Form.Item label="Weight" name="weight">
                        <Input placeholder="E.g. 25 kg" />
                      </Form.Item>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              key: "whatsapp",
              label: (
                <span className="flex items-center gap-1.5 font-medium">
                  <Share2 size={15} /> WhatsApp Pitch
                </span>
              ),
              children: (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Pre-formatted message ready to share with prospective buyers & dealers.
                    </span>
                    <Button
                      size="small"
                      icon={copiedPitch ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      onClick={copyWhatsAppPitch}
                      className="text-xs"
                    >
                      {copiedPitch ? "Copied!" : "Copy Pitch"}
                    </Button>
                  </div>

                  <Form.Item name="whatsappPitch">
                    <TextArea
                      rows={6}
                      placeholder="🌟 *Product Name*&#10;&#10;Key features...&#10;&#10;💰 Special Price: ₹..."
                      className="font-mono text-xs"
                    />
                  </Form.Item>
                </div>
              ),
            },
          ]}
        />

        <div className="mt-6 flex justify-end gap-2 border-t pt-3 dark:border-slate-800">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" htmlType="submit" className="bg-blue-600 hover:bg-blue-700">
            {initialValues ? "Update Product" : "Save to Catalogue"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
