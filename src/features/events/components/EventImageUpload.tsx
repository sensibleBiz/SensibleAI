import { Button, Form, Input, Select, Upload, message } from "antd";
import type { FormInstance, UploadProps } from "antd";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { uploadBase64FileToStorage } from "@/shared/utils/storageService";
import type { EventFormValues, EventImageAsset } from "../types/eventTypes";

const businessTypeOptions = [
  { label: "POS / Billing Machine", value: "POS / Billing Machine" },
  {
    label: "Attendance / Biometric Machine",
    value: "Attendance / Biometric Machine",
  },
  { label: "Software / CRM Solutions", value: "Software / CRM Solutions" },
  { label: "CCTV Service Provider", value: "CCTV Service Provider" },
  { label: "Note Counting Machine", value: "Note Counting Machine" },
  { label: "Other", value: "Other" },
];

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getFileExtension = (fileName: string) =>
  fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : ".jpg";

const getFileBaseName = (fileName: string) =>
  fileName.replace(/\.[^/.]+$/, "").trim() || "event-image";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "event";

const getImages = (form: FormInstance<EventFormValues>): EventImageAsset[] =>
  Array.isArray(form.getFieldValue("eventImages"))
    ? (form.getFieldValue("eventImages") as EventImageAsset[])
    : [];

function HiddenFormValue() {
  return null;
}

interface EventImageUploadProps {
  form: FormInstance<EventFormValues>;
}

export default function EventImageUpload({ form }: EventImageUploadProps) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageName, setImageName] = useState("");
  const [businessType, setBusinessType] = useState<string>();
  const imageUrl = Form.useWatch("imageUrl", form);
  const eventImages = (Form.useWatch("eventImages", form) || []) as EventImageAsset[];

  useEffect(() => {
    if (!imageUrl || eventImages.length > 0) return;

    form.setFieldValue("eventImages", [
      {
        id: "primary-event-image",
        name: "Primary Event Image",
        businessType: "Other",
        url: imageUrl,
      },
    ]);
  }, [eventImages.length, form, imageUrl]);

  const syncImages = (images: EventImageAsset[], primaryUrl?: string) => {
    form.setFieldsValue({
      eventImages: images,
      imageUrl: primaryUrl ?? images[0]?.url,
    });
    form.validateFields(["eventImages", "imageUrl"]);
  };

  const handleImageUpload: UploadProps["beforeUpload"] = async (file) => {
    if (!file.type.startsWith("image/")) {
      message.error("Please upload image files only");
      return Upload.LIST_IGNORE;
    }

    if (!businessType) {
      message.error("Select business type before uploading images");
      return Upload.LIST_IGNORE;
    }

    setIsUploadingImage(true);

    try {
      const base64 = await fileToBase64(file);
      const displayName = imageName.trim() || getFileBaseName(file.name);
      const businessTypeSlug = slugify(businessType);
      const fileName = `${businessTypeSlug}-${slugify(displayName)}-${Date.now()}${getFileExtension(
        file.name
      )}`;
      const { url, error } = await uploadBase64FileToStorage(
        `events/${businessTypeSlug}`,
        fileName,
        base64
      );

      if (error || !url) {
        throw new Error(error ?? "Image upload failed");
      }

      const currentImages = getImages(form);
      const nextImages = [
        ...currentImages,
        {
          id: `${Date.now()}-${currentImages.length}`,
          name: displayName,
          businessType,
          url,
          originalFileName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      ];

      syncImages(nextImages, imageUrl || url);
      setImageName("");
      message.success("Event image uploaded");
    } catch {
      message.error("Failed to upload image");
    } finally {
      setIsUploadingImage(false);
    }

    return Upload.LIST_IGNORE;
  };

  const updateImage = (
    image: EventImageAsset,
    changes: Partial<Pick<EventImageAsset, "name" | "businessType">>
  ) => {
    const nextImages = eventImages.map((item) =>
      item.id === image.id ? { ...item, ...changes } : item
    );
    syncImages(nextImages, imageUrl);
  };

  const removeImage = (image: EventImageAsset) => {
    const nextImages = eventImages.filter((item) => item.id !== image.id);
    syncImages(nextImages, imageUrl === image.url ? nextImages[0]?.url : imageUrl);
  };

  const makePrimary = (image: EventImageAsset) => {
    form.setFieldValue("imageUrl", image.url);
    form.validateFields(["imageUrl"]);
  };

  return (
    <div className="space-y-4">
      <Form.Item
        name="imageUrl"
        hidden
        valuePropName="value"
        rules={[{ required: true, message: "At least one event image is required" }]}
      >
        <Input type="hidden" />
      </Form.Item>
      <Form.Item
        name="eventImages"
        hidden
        rules={[
          {
            validator: (_, value) =>
              Array.isArray(value) && value.length > 0
                ? Promise.resolve()
                : Promise.reject(new Error("At least one event image is required")),
          },
        ]}
      >
        <HiddenFormValue />
      </Form.Item>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input
          value={imageName}
          onChange={(event) => setImageName(event.target.value)}
          placeholder="Image name, e.g. POS banner"
        />
        <Select
          value={businessType}
          onChange={setBusinessType}
          options={businessTypeOptions}
          placeholder="Select business type for image"
          showSearch
          optionFilterProp="label"
        />
      </div>

      <Upload.Dragger
        accept="image/*"
        beforeUpload={handleImageUpload}
        multiple
        showUploadList={false}
        disabled={isUploadingImage}
        className="!rounded-lg !border-slate-200 !bg-slate-50 hover:!border-[#0a3750]"
      >
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-slate-600">
          {isUploadingImage ? (
            <Loader2 size={26} className="animate-spin text-[#0a3750]" />
          ) : (
            <ImagePlus size={26} className="text-[#0a3750]" />
          )}
          <div className="text-sm font-medium text-slate-900 sm:text-base">
            {isUploadingImage
              ? "Uploading images..."
              : "Click or drag multiple event images to upload"}
          </div>
          <div className="hidden text-xs text-slate-400 sm:block">
            Select a business type first. PNG or JPG recommended.
          </div>
        </div>
      </Upload.Dragger>

      {eventImages.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {eventImages.map((image) => (
            <div
              key={image.id || image.url}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <div className="relative flex h-44 items-center justify-center bg-slate-50">
                <img
                  src={image.url}
                  alt={image.name || "Event image"}
                  className="h-full w-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => removeImage(image)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-[#ff3228]"
                  aria-label="Remove image"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 p-3">
                <Input
                  value={image.name}
                  onChange={(event) =>
                    updateImage(image, { name: event.target.value })
                  }
                  placeholder="Image name"
                />
                <Select
                  value={image.businessType}
                  onChange={(value) => updateImage(image, { businessType: value })}
                  options={businessTypeOptions}
                  placeholder="Business type"
                  showSearch
                  optionFilterProp="label"
                  className="w-full"
                />
                <Button
                  block
                  size="small"
                  type={image.url === imageUrl ? "primary" : "default"}
                  onClick={() => makePrimary(image)}
                >
                  {image.url === imageUrl ? "Primary Image" : "Set as Primary"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
