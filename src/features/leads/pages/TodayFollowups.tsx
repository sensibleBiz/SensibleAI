import { useEffect, useState } from "react";
import { Card, List, Typography, Tag } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";

import { RootState } from "@/app/store";
import { LeadActivity } from "../types/types";
import { ProductItem } from "@/features/products";
import { leadApi, type LeadActivityItem } from "../api/leadApi";
import { productApi } from "@/features/products";
import { toTitleCase } from "@/shared/utils/helperFunctions";

const { Text } = Typography;

export default function RightPanel() {
  const [blinkIds, setBlinkIds] = useState<string[]>([]);
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [, setLoadingProducts] = useState(true);

  const [activities, setActivities] = useState<Array<LeadActivity | LeadActivityItem>>([]);
  const [, setLoadingActivities] = useState(true);

  /* PostgreSQL sessions load products from PostgreSQL only; legacy keeps Firestore subscription. */
  useEffect(() => {
    if (!outletId) return;

    const abortController = new AbortController();
      void productApi
        .listProducts({ outletId }, abortController.signal)
        .then((response) => {
          setProducts(
            response.items
              .filter((item) => item.active)
              .map((item) => ({
                id: item.id,
                name: item.name,
                mrpPrice: item.mrpPrice,
                price: item.price,
                isAddOn: item.isAddOn,
                isDeleted: !item.active,
              })),
          );
          setLoadingProducts(false);
        })
        .catch((error) => {
          if (!abortController.signal.aborted) {
            console.error("Product Error:", error);
          }
        });
    return () => abortController.abort();
  }, [outletId]);

  /* PostgreSQL sessions use only crm.activities; legacy sessions retain the Firestore subscription. */
  useEffect(() => {
    if (!outletId) return;

    const todayStart = dayjs().startOf("day").valueOf();
    const todayEnd = dayjs().endOf("day").valueOf();

    const abortController = new AbortController();
      void leadApi.getMonthlyActivities({
        outletId,
        startDate: todayStart,
        endDate: todayEnd,
        status: "PENDING",
        limit: 100,
      }, abortController.signal).then((result) => {
        setActivities([...result.items].sort((left, right) => left.scheduledDate - right.scheduledDate));
        setLoadingActivities(false);
      }).catch((error) => {
        if (!abortController.signal.aborted) console.error("Activity Error:", error);
      });
    return () => abortController.abort();
  }, [outletId]);

  useEffect(() => {
    const now = dayjs();

    const matched = activities
      .filter(
        (item) => dayjs(item.scheduledDate).isSame(now, "minute") // match current minute
      )
      .map((item) => item.id);

    if (matched.length > 0) {
      setBlinkIds((prev) => [...prev, ...matched]);

      // stop blinking after 5 minutes
      setTimeout(() => {
        setBlinkIds((prev) => prev.filter((id) => !matched.includes(id)));
      }, 3 * 60 * 1000);
    }
  }, [activities]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ---------------------- 🟦 TOP SECTION (40%) ---------------------- */}
      <div
        style={{
          maxHeight: "30vh",
          overflowY: "auto",
          paddingRight: 6,
        }}
      >
        <Card title="Sensible Products" variant="borderless">
          {products.length === 0 ? (
            <Text type="secondary">No products found</Text>
          ) : (
            <List
              dataSource={products}
              renderItem={(item) => (
                <List.Item
                  style={{
                    borderBottom: "1px solid #f1f1f1",
                    padding: "8px 0",
                  }}
                >
                  <div>
                    <Text strong>{item?.name}</Text>
                    <br />
                    <div className="flex justify-between">
                      <Text type="secondary">
                        {/* customer price */}
                        Cust: ₹{item?.mrpPrice}
                      </Text>
                      {/* <br /> */}
                      <Text type="secondary">
                        {/* delere price */}
                        Dealer: ₹{item?.price}
                      </Text>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>

      {/* ---------------------- 🟩 BOTTOM SECTION (60%) ------------------- */}
      <div
        style={{
          height: "70vh",
          overflowY: "auto",
          paddingTop: 10,
          paddingRight: 6,
        }}
      >
        <Card
          title="📅 Today's Follow-ups"
          variant="borderless"
          style={{ borderRadius: 10 }}
        >
          {activities.length === 0 ? (
            <Text type="secondary">No follow-ups for today 🎉</Text>
          ) : (
            <List
              dataSource={activities}
              renderItem={(item) => (
                <List.Item
                  className={blinkIds.includes(item.id) ? "blink-card" : ""}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    padding: "14px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    borderRadius: 8,
                  }}
                >
                  {/* Lead Name */}
                  <Text strong style={{ fontSize: 14, color: "#1a1a1a" }}>
                    {toTitleCase(item.leadName, "-")}
                  </Text>

                  {/* Activity Type + Description */}
                  <Text style={{ fontSize: 13, color: "#555" }}>
                    <b>{item.type}</b> — {item.description}
                  </Text>

                  {/* Status Tag */}
                  <div className="w-full flex justify-between items-center">
                    {/* Time */}
                    <Text style={{ fontSize: 12, color: "#999" }}>
                      {dayjs(item?.scheduledDate).format("DD MMM, hh:mm A")}
                    </Text>
                    <Tag
                      color={
                        item.status?.toUpperCase() === "DONE" ? "green" : "blue"
                      }
                      style={{ width: "fit-content", fontSize: 12 }}
                    >
                      {item?.status}
                    </Tag>
                  </div>
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
