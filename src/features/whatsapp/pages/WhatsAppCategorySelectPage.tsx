import React from "react";
import { Spin } from "antd";
import {
  ArrowRightOutlined,
  CalendarOutlined,
  InboxOutlined,
  MessageOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  WHATSAPP_CATEGORY_OPTIONS,
  type WhatsAppCategoryStats,
  type WhatsAppMessageCategory,
} from "./whatsappCategories";

interface WhatsAppCategorySelectPageProps {
  onSelectCategory: (category: WhatsAppMessageCategory) => void;
  stats?: Record<WhatsAppMessageCategory, WhatsAppCategoryStats>;
  loading?: boolean;
}

const categoryPresentation: Record<
  WhatsAppMessageCategory,
  {
    icon: React.ReactNode;
    iconClassName: string;
    borderClassName: string;
  }
> = {
  renewal: {
    icon: <ReloadOutlined />,
    iconClassName: "bg-emerald-50 text-emerald-700",
    borderClassName: "hover:border-emerald-300",
  },
  event: {
    icon: <CalendarOutlined />,
    iconClassName: "bg-sky-50 text-sky-700",
    borderClassName: "hover:border-sky-300",
  },
  crm: {
    icon: <MessageOutlined />,
    iconClassName: "bg-amber-50 text-amber-700",
    borderClassName: "hover:border-amber-300",
  },
  others: {
    icon: <InboxOutlined />,
    iconClassName: "bg-slate-100 text-slate-700",
    borderClassName: "hover:border-slate-300",
  },
};

const WhatsAppCategorySelectPage: React.FC<WhatsAppCategorySelectPageProps> = ({
  onSelectCategory,
  stats,
  loading = false,
}) => (
  <div className="flex h-[calc(100dvh-88px)] min-h-0 overflow-hidden bg-[#f0f2f5] md:h-[calc(100vh-96px)]">
    <div className="flex w-full flex-col border-r border-gray-300 bg-white md:w-[35%] md:min-w-[280px] md:max-w-[400px] lg:w-[30%]">
      <div className="bg-[#008069] px-4 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-white">
          WhatsApp Messages Template
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {WHATSAPP_CATEGORY_OPTIONS.map((option) => {
          const presentation = categoryPresentation[option.key];
          const categoryStats = stats?.[option.key] ?? {
            all: 0,
            read: 0,
            unread: 0,
          };
          const statItems = [
            { label: "All", value: categoryStats.all },
            { label: "Unread", value: categoryStats.unread },
            { label: "Read", value: categoryStats.read },
          ];

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelectCategory(option.key)}
              className={`group flex w-full items-center gap-3 border-b border-gray-100 bg-white px-4 py-4 text-left transition-colors hover:bg-[#f5f6f6] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#008069] ${presentation.borderClassName}`}
            >
              <span
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg text-xl ${presentation.iconClassName}`}
              >
                {presentation.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-gray-900">
                    {option.label}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-gray-500">
                      {option.description}
                    </span>
                  </span>
                  <ArrowRightOutlined className="mt-1 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-[#008069]" />
                </span>

                <span className="mt-3 grid grid-cols-3 gap-2">
                  {statItems.map((item) => (
                    <span
                      key={item.label}
                      className="rounded-md border border-gray-100 bg-gray-50 px-2 py-2"
                    >
                      <span className="block text-[10px] font-medium uppercase tracking-wide text-gray-500">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-gray-900">
                        {loading ? (
                          <Spin size="small" />
                        ) : (
                          item.value.toLocaleString("en-IN")
                        )}
                      </span>
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>

    <div className="hidden flex-1 items-center justify-center bg-[#efeae2] md:flex">
      <div className="text-center">
        <MessageOutlined className="mb-4 text-6xl text-gray-400" />
        <p className="text-gray-500 text-lg">Select a category</p>
      </div>
    </div>
  </div>
);

export default WhatsAppCategorySelectPage;
