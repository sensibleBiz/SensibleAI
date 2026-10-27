import { Card, Statistic, Progress, Typography } from "antd";
import { ReactNode } from "react";
import { useRef, useEffect, useState } from "react";

const { Text } = Typography;

interface StatCardProps {
  title: string;
  value: number;
  icon: ReactNode;
  gradient: string;
  shadowColor: string;
  progressPercent?: number;
  suffix?: string;
  description?: string;
}

// Animated Counter Component
const AnimatedCounter = ({ value, duration = 1500 }: { value: number; duration?: number }) => {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);

  useEffect(() => {
    const increment = value / (duration / 16);
    const timer = setInterval(() => {
      countRef.current += increment;
      if (countRef.current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(countRef.current));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value, duration]);

  return <span>{count}</span>;
};

export default function StatCard({
  title,
  value,
  icon,
  gradient,
  shadowColor,
  progressPercent,
  suffix,
  description,
}: StatCardProps) {
  return (
    <Card
      className="responsive-stat-card"
      hoverable
      style={{
        height: "100%",
        borderRadius: "16px",
        border: "none",
        boxShadow: `0 8px 24px ${shadowColor}`,
        background: gradient,
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        cursor: "pointer",
      }}
      styles={{ body: { height: "100%", padding: "20px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Text style={{ color: "rgba(255, 255, 255, 0.8)", fontSize: "13px", fontWeight: 500 }}>
            {title}
          </Text>
          <Statistic
            value={value}
            suffix={suffix}
            valueStyle={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#fff",
              marginTop: "8px",
            }}
            formatter={(val) => <AnimatedCounter value={Number(val)} />}
          />
          {description && (
            <div style={{ marginTop: "4px" }}>
              <Text style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: "12px", fontWeight: 600 }}>
                {description}
              </Text>
            </div>
          )}
        </div>
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "12px",
            background: "rgba(255, 255, 255, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.3s ease",
          }}
        >
          {icon}
        </div>
      </div>
      {progressPercent !== undefined && (
        <Progress
          percent={progressPercent}
          showInfo={false}
          strokeColor="#fff"
          trailColor="rgba(255, 255, 255, 0.2)"
          strokeWidth={4}
          style={{ marginTop: "12px" }}
        />
      )}
    </Card>
  );
}

