"use client";

import { useEffect, useRef } from "react";
import type { Chart as ChartJS } from "chart.js";
import { WalletOutlined, RiseOutlined, FallOutlined, FileTextOutlined } from "@ant-design/icons";
import StatCard from "@/shared/components/ui/StatCard";
import WalletCard from "../components/WalletCard";



const flowSteps = [
  { num: 1, label: "Sell subscription", sub: "Dealer gives subscription", bg: "#E6F1FB", nc: "#185FA5", icon: "🖥️" },
  { num: 2, label: "Earn reward", sub: "Points added to wallet", bg: "#FAEEDA", nc: "#BA7517", icon: "🎁" },
  { num: 3, label: "Balance increases", sub: "1 Point = ₹1", bg: "#EAF3DE", nc: "#3B6D11", icon: "👛" },
  { num: 4, label: "Buy products", sub: "Hardware / software", bg: "#EEEDFE", nc: "#534AB7", icon: "🛒" },
  { num: 5, label: "Wallet used", sub: "Auto-applied", bg: "#EAF3DE", nc: "#3B6D11", icon: "🪙" },
  { num: 6, label: "Pay remaining", sub: "Pay balance online", bg: "#FCEBEB", nc: "#A32D2D", icon: "💳" },
  { num: 7, label: "Order confirmed", sub: "Placed successfully", bg: "#EAF3DE", nc: "#3B6D11", icon: "✅" },
];

const rewardRules = [
  { key: "1M", name: "1 Month subscription", pts: "+ 400 Points", bg: "#E6F1FB", tc: "#0C447C", ptc: "#185FA5" },
  { key: "6M", name: "6 Months subscription", pts: "+ 2,200 Points", bg: "#FAEEDA", tc: "#633806", ptc: "#BA7517" },
  { key: "12M", name: "12 Months subscription", pts: "+ 5,000 Points", bg: "#EAF3DE", tc: "#27500A", ptc: "#3B6D11" },
];

const transactions = [
  { name: "Subscription (6 month)", date: "12 May 2025 · 10:30 AM", amt: "+₹2,200", plus: true },
  { name: "Subscription (1 month)", date: "10 May 2025 · 04:25 PM", amt: "+₹400", plus: true },
  { name: "Product purchase", date: "08 May 2025 · 11:15 AM", amt: "-₹5,600", plus: false },
  { name: "Wallet top-up", date: "05 May 2025 · 01:20 PM", amt: "+₹5,000", plus: true },
];

const purchaseSteps = [
  { label: "Product price", val: "₹20,000", icon: "🛒", border: "#d1d5db", bg: "#fff", vc: "#534AB7" },
  { label: "Wallet balance", val: "₹7,600", icon: "👛", border: "#97C459", bg: "#EAF3DE", vc: "#3B6D11" },
  { label: "Wallet used", val: "₹7,600", icon: "🪙", border: "#97C459", bg: "#EAF3DE", vc: "#3B6D11" },
  { label: "Pay remaining", val: "₹12,400", icon: "💳", border: "#F09595", bg: "#FCEBEB", vc: "#A32D2D" },
  { label: "Order placed", val: "Done ✓", icon: "✅", border: "#97C459", bg: "#EAF3DE", vc: "#3B6D11" },
];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const earned = [5000, 2600, 7200, 4400, 5000, 2600];
const used = [3200, 2000, 6000, 3800, 5600, 1200];

export default function DealerWalletDashboard() {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutInstance = useRef<ChartJS | null>(null);
  const barInstance = useRef<ChartJS | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { Chart, registerables } = await import("chart.js");
      if (cancelled) return;
      Chart.register(...registerables);

      if (donutRef.current) {
        donutInstance.current?.destroy();
        donutInstance.current = new Chart(donutRef.current, {
          type: "doughnut",
          data: {
            labels: ["Used", "Available"],
            datasets: [{ data: [28800, 7600], backgroundColor: ["#185FA5", "#C0DD97"], borderWidth: 0, hoverOffset: 4 }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "72%",
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => " ₹" + (c.raw as number).toLocaleString("en-IN") } },
            },
          },
        });
      }

      if (barRef.current) {
        barInstance.current?.destroy();
        barInstance.current = new Chart(barRef.current, {
          type: "bar",
          data: {
            labels: months,
            datasets: [
              { label: "Earned", data: earned, backgroundColor: "#185FA5", borderRadius: 4, borderSkipped: false as const },
              { label: "Used", data: used, backgroundColor: "#E24B4A", borderRadius: 4, borderSkipped: false as const },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 11 } } },
              y: {
                grid: { color: "rgba(0,0,0,0.05)" },
                ticks: { font: { size: 11 }, callback: (v) => "₹" + Number(v).toLocaleString("en-IN") },
              },
            },
          },
        });
      }
    };
    load();
    return () => {
      cancelled = true;
      donutInstance.current?.destroy();
      barInstance.current?.destroy();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f8fc] p-3 sm:p-4 lg:p-5 space-y-3 sm:space-y-4 overflow-x-hidden">

      {/* Stat Cards — using your StatCard component */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Wallet Balance"
          value={7600}
          suffix=" pts"
          description="1 Point = ₹1"
          icon={<WalletOutlined style={{ fontSize: 24, color: "#fff" }} />}
          gradient="linear-gradient(135deg, #185FA5 0%, #378ADD 100%)"
          shadowColor="rgba(24,95,165,0.15)"
          progressPercent={21}
        />
        <StatCard
          title="Total Earned"
          value={36400}
          suffix=" pts"
          description="All time rewards"
          icon={<RiseOutlined style={{ fontSize: 24, color: "#fff" }} />}
          gradient="linear-gradient(135deg, #3B6D11 0%, #639922 100%)"
          shadowColor="rgba(59,109,17,0.15)"
          progressPercent={100}
        />
        <StatCard
          title="Total Used"
          value={28800}
          suffix=" pts"
          description="On purchases"
          icon={<FallOutlined style={{ fontSize: 24, color: "#fff" }} />}
          gradient="linear-gradient(135deg, #A32D2D 0%, #E24B4A 100%)"
          shadowColor="rgba(163,45,45,0.15)"
          progressPercent={79}
        />
        <StatCard
          title="Active Subscriptions"
          value={14}
          description="This month"
          icon={<FileTextOutlined style={{ fontSize: 24, color: "#fff" }} />}
          gradient="linear-gradient(135deg, #BA7517 0%, #EF9F27 100%)"
          shadowColor="rgba(186,117,23,0.15)"
          progressPercent={70}
        />
      </div>
<WalletCard walletBalance={7600} totalEarned={36400} totalUsed={28800} />;
      {/* Flow Strip */}
      <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4">
        <p className="text-xs font-medium text-gray-500 mb-3">How it works</p>
        <div className="flex items-start overflow-x-auto pb-2 gap-0 snap-x">
          {flowSteps.map((step, i) => (
            <div key={step.num} className="flex items-center flex-shrink-0 snap-start">
              <div className="flex flex-col items-center text-center w-[72px] sm:w-[80px] gap-1">
                <div
                  className="w-5 h-5 rounded-full text-[10px] font-medium flex items-center justify-center"
                  style={{ background: step.bg, color: step.nc }}
                >
                  {step.num}
                </div>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: step.bg }}
                >
                  {step.icon}
                </div>
                <p className="text-[10px] font-medium text-gray-800 leading-tight">{step.label}</p>
                <p className="text-[9px] text-gray-400 leading-tight">{step.sub}</p>
              </div>
              {i < flowSteps.length - 1 && (
                <span className="text-gray-300 text-sm mx-1 mt-[-14px] flex-shrink-0">›</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* Wallet Detail */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-3">My wallet</p>
          <p className="text-xs text-gray-400">Current balance</p>
          <p className="text-2xl font-semibold text-[#185FA5] leading-tight mt-1">₹ 7,600</p>
          <p className="text-[10px] text-gray-400 mt-1 mb-3">1 Point = ₹1</p>
          <div className="flex justify-between text-[10px] text-gray-400 mb-1">
            <span>Used ₹28,800</span><span>Total ₹36,400</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#185FA5] rounded-full" style={{ width: "79%" }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1 mb-3">
            <span className="text-[#3B6D11]">79% utilised</span>
            <span className="text-gray-400">21% available</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { l: "Earned", v: "₹36,400", c: "#3B6D11" },
              { l: "Used", v: "₹28,800", c: "#A32D2D" },
              { l: "Available", v: "₹7,600", c: "#185FA5" },
            ].map((m) => (
              <div key={m.l} className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-gray-400">{m.l}</p>
                <p className="text-[11px] font-semibold" style={{ color: m.c }}>{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Reward Rules */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-3">Reward rules</p>
          <div className="space-y-2">
            {rewardRules.map((r) => (
              <div key={r.key} className="flex items-center gap-2 border border-gray-100 rounded-xl p-2">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                  style={{ background: r.bg, color: r.tc }}
                >
                  {r.key}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500">{r.name}</p>
                  <p className="text-xs font-semibold" style={{ color: r.ptc }}>{r.pts}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-[#E6F1FB] rounded-xl py-2 text-center text-xs font-semibold text-[#0C447C]">
            1 Point = ₹1
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-3">Recent transactions</p>
          <div>
            {transactions.map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                    style={{ background: t.plus ? "#EAF3DE" : "#FCEBEB", color: t.plus ? "#3B6D11" : "#A32D2D" }}
                  >
                    {t.plus ? "+" : "−"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-800 truncate">{t.name}</p>
                    <p className="text-[9px] text-gray-400 truncate">{t.date}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold flex-shrink-0" style={{ color: t.plus ? "#3B6D11" : "#A32D2D" }}>
                  {t.amt}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Purchase Example + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-3">Purchase example</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
            {purchaseSteps.map((s, i) => (
              <div
                key={i}
                className="rounded-xl p-2 text-center border min-w-0"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <div className="text-xl mb-1">{s.icon}</div>
                <p className="text-[9px] text-gray-500 mb-1">{s.label}</p>
                <p className="text-xs font-semibold break-words" style={{ color: s.vc }}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
          <p className="text-xs font-medium text-gray-500 mb-2">Wallet utilisation</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
            {[["#185FA5", "Used 79%"], ["#C0DD97", "Available 21%"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
          <div className="relative h-32 sm:h-36">
            <canvas ref={donutRef} role="img" aria-label="Donut chart wallet utilisation" />
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white border border-gray-100 rounded-2xl p-3 sm:p-4 min-w-0">
        <p className="text-xs font-medium text-gray-500 mb-2">Monthly reward earnings</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          {[["#185FA5", "Points earned"], ["#E24B4A", "Points used"]].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: c }} />{l}
            </span>
          ))}
        </div>
        <div className="relative h-52 sm:h-44">
          <canvas ref={barRef} role="img" aria-label="Bar chart monthly reward earnings vs usage" />
        </div>
      </div>

    </div>
  );
}
