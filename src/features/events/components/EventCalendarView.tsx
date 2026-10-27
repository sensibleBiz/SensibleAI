import { Button, Calendar, Dropdown, Empty, Grid, Spin, Tooltip } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  MoreHorizontal,
  Pencil,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePermission } from "@/features/access-control";
import type { EventItem, EventStatus } from "../types/eventTypes";
import { PERMISSION_MASTER, ROLES } from "@/shared/lib/constants";

export interface EventCalendarViewProps {
  events: EventItem[];
  loading: boolean;
  onEventClick: (event: EventItem) => void;
  onDateClick?: (date: Dayjs) => void;
  onMonthChange?: (month: Dayjs) => void;
  onEditClick?: (event: EventItem) => void;
}

const MAX_EVENTS_PER_DAY = 3;

const statusStyles: Record<
  EventStatus,
  { accent: string; background: string; text: string }
> = {
  Active: {
    accent: "#15803d",
    background: "#f0fdf4",
    text: "#166534",
  },
  Inactive: {
    accent: "#64748b",
    background: "#f8fafc",
    text: "#475569",
  },
  Expired: {
    accent: "#dc2626",
    background: "#fef2f2",
    text: "#991b1b",
  },
};

const isRegistrationClosed = (event: EventItem) => {
  const deadline = dayjs(event.registrationExpiryDate);
  return deadline.isValid() && deadline.isBefore(dayjs());
};

export default function EventCalendarView({
  events,
  loading,
  onEventClick,
  onDateClick,
  onMonthChange,
  onEditClick,
}: EventCalendarViewProps) {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { hasPermission, hasAnyRole } = usePermission();
  const canEdit =
    hasPermission(PERMISSION_MASTER.CRM_EVENTS_EDIT) ||
    hasAnyRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const canCreate =
    hasPermission(PERMISSION_MASTER.CRM_EVENTS_CREATE) ||
    hasAnyRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
  const [calendarValue, setCalendarValue] = useState(() => dayjs());
  const [selectedDate, setSelectedDate] = useState(() => dayjs());
  const monthKey = calendarValue.format("YYYY-MM");

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, EventItem[]>();

    events.forEach((event) => {
      const eventDate = dayjs(event.eventDateTime);
      if (!eventDate.isValid()) return;

      const key = eventDate.format("YYYY-MM-DD");
      const current = grouped.get(key) ?? [];
      current.push(event);
      grouped.set(key, current);
    });

    grouped.forEach((dayEvents) => {
      dayEvents.sort(
        (first, second) =>
          dayjs(first.eventDateTime).valueOf() -
          dayjs(second.eventDateTime).valueOf()
      );
    });

    return grouped;
  }, [events]);

  useEffect(() => {
    onMonthChange?.(dayjs(`${monthKey}-01`).startOf("month"));
  }, [monthKey, onMonthChange]);

  const eventsForDate = (date: Dayjs) =>
    eventsByDate.get(date.format("YYYY-MM-DD")) ?? [];

  const selectDate = (date: Dayjs) => {
    setSelectedDate(date);
    setCalendarValue(date);

    if (!isMobile && canCreate && eventsForDate(date).length === 0) {
      onDateClick?.(date);
    }
  };

  const changeMonth = (month: Dayjs) => {
    setCalendarValue(month);
    setSelectedDate(month);
  };

  const eventMenu = (event: EventItem) => ({
    items: [
      {
        key: "edit",
        icon: <Pencil size={14} />,
        label: "Edit event",
        onClick: () => onEditClick?.(event),
      },
    ],
  });

  const renderEventChip = (event: EventItem, mobileAgenda = false) => {
    const style = statusStyles[event.status];
    const registrationClosed = isRegistrationClosed(event);

    return (
      <div
        key={event.id}
        role="button"
        tabIndex={0}
        className={
          mobileAgenda
            ? "group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow"
            : "group relative mb-1 cursor-pointer overflow-hidden rounded-md border px-2 py-1 text-left transition hover:brightness-95"
        }
        style={
          mobileAgenda
            ? { borderLeft: `4px solid ${style.accent}` }
            : {
                borderColor: `${style.accent}33`,
                borderLeft: `3px solid ${style.accent}`,
                backgroundColor: style.background,
                color: style.text,
              }
        }
        onClick={(eventClick) => {
          eventClick.stopPropagation();
          onEventClick(event);
        }}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            onEventClick(event);
          }
        }}
      >
        <div className="flex min-w-0 items-start justify-between gap-1">
          <div className="min-w-0">
            <div
              className={`truncate font-semibold ${
                mobileAgenda ? "text-sm text-slate-900" : "text-[11px]"
              }`}
              title={event.name}
            >
              {event.name}
            </div>
            <div
              className={`mt-0.5 flex min-w-0 items-center gap-1.5 ${
                mobileAgenda ? "text-xs text-slate-500" : "text-[10px]"
              }`}
            >
              <Clock3 size={mobileAgenda ? 12 : 10} className="shrink-0" />
              <span>{dayjs(event.eventDateTime).format("hh:mm A")}</span>
              {event.city ? (
                <>
                  <span aria-hidden="true">&middot;</span>
                  <MapPin size={mobileAgenda ? 12 : 10} className="shrink-0" />
                  <span className="truncate">{event.city}</span>
                </>
              ) : null}
            </div>
            {mobileAgenda ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className="rounded-full px-2 py-0.5 font-medium"
                  style={{ backgroundColor: style.background, color: style.text }}
                >
                  {event.status}
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Users size={12} />
                  {event.totalRegistrations} registered
                </span>
                {registrationClosed ? (
                  <span className="flex items-center gap-1 font-medium text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Registration closed
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] opacity-80">
                <span className="flex items-center gap-1">
                  <Users size={10} />
                  {event.totalRegistrations}
                </span>
                {registrationClosed ? (
                  <Tooltip title="Registration deadline has passed">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                      aria-label="Registration deadline has passed"
                    />
                  </Tooltip>
                ) : null}
              </div>
            )}
          </div>

          {canEdit && onEditClick ? (
            <Dropdown menu={eventMenu(event)} trigger={["click"]}>
              <Button
                type="text"
                size="small"
                aria-label={`Actions for ${event.name}`}
                className={mobileAgenda ? "shrink-0" : "-mr-1 -mt-1 shrink-0"}
                icon={<MoreHorizontal size={14} />}
                onClick={(buttonEvent) => buttonEvent.stopPropagation()}
              />
            </Dropdown>
          ) : null}
        </div>
      </div>
    );
  };

  const dateCellRender = (date: Dayjs) => {
    const dayEvents = eventsForDate(date);

    if (isMobile) {
      return dayEvents.length > 0 ? (
        <div className="mt-1 flex justify-center gap-0.5" aria-label={`${dayEvents.length} events`}>
          {dayEvents.slice(0, MAX_EVENTS_PER_DAY).map((event) => (
            <span
              key={event.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: statusStyles[event.status].accent }}
            />
          ))}
        </div>
      ) : null;
    }

    return (
      <div className="mt-1">
        {dayEvents.slice(0, MAX_EVENTS_PER_DAY).map((event) =>
          renderEventChip(event)
        )}
        {dayEvents.length > MAX_EVENTS_PER_DAY ? (
          <div className="px-1 text-[10px] font-semibold text-slate-500">
            +{dayEvents.length - MAX_EVENTS_PER_DAY} more
          </div>
        ) : null}
      </div>
    );
  };

  const selectedDayEvents = eventsForDate(selectedDate);

  return (
    <div className="event-calendar-view relative">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100 pb-3 text-xs text-slate-600">
        <span className="font-semibold uppercase tracking-wide text-slate-400">
          Status
        </span>
        {Object.entries(statusStyles).map(([label, style]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: style.accent }}
            />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Registration closed
        </span>
      </div>

      <Calendar
        value={calendarValue}
        fullscreen={!isMobile}
        onSelect={selectDate}
        onPanelChange={(date) => changeMonth(date)}
        cellRender={(date, info) =>
          info.type === "date" ? dateCellRender(date) : info.originNode
        }
        headerRender={({ value }) => (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                shape="circle"
                size="small"
                aria-label="Previous month"
                icon={<ChevronLeft size={16} />}
                onClick={() => changeMonth(value.subtract(1, "month"))}
              />
              <div className="min-w-36 text-center text-base font-semibold text-slate-900">
                {value.format("MMMM YYYY")}
              </div>
              <Button
                shape="circle"
                size="small"
                aria-label="Next month"
                icon={<ChevronRight size={16} />}
                onClick={() => changeMonth(value.add(1, "month"))}
              />
            </div>
            <Button size="small" onClick={() => changeMonth(dayjs())}>
              Today
            </Button>
          </div>
        )}
      />

      {isMobile ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-3">
            <h3 className="m-0 text-sm font-semibold text-slate-900">
              {selectedDate.format("dddd, DD MMMM")}
            </h3>
            <p className="m-0 mt-0.5 text-xs text-slate-500">
              {selectedDayEvents.length} event{selectedDayEvents.length === 1 ? "" : "s"}
            </p>
          </div>
          {selectedDayEvents.length > 0 ? (
            <div className="space-y-2">
              {selectedDayEvents.map((event) => renderEventChip(event, true))}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No events scheduled for this day"
            >
              {onDateClick && canCreate ? (
                <Button type="primary" size="small" onClick={() => onDateClick(selectedDate)}>
                  Create event
                </Button>
              ) : null}
            </Empty>
          )}
        </div>
      ) : null}

      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-[1px]">
          <Spin tip="Loading events" />
        </div>
      ) : null}

      <style>{`
        .event-calendar-view .ant-picker-calendar-header {
          display: none;
        }
        .event-calendar-view .ant-picker-cell::before {
          border-radius: 8px !important;
        }
        .event-calendar-view .ant-picker-calendar-date {
          min-height: 116px;
          border-color: #e2e8f0 !important;
        }
        .event-calendar-view .ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-calendar-date-value {
          align-items: center;
          background: #0f3557;
          border-radius: 999px;
          color: white;
          display: inline-flex;
          height: 24px;
          justify-content: center;
          width: 24px;
        }
        @media (max-width: 767px) {
          .event-calendar-view .ant-picker-calendar-date {
            min-height: auto;
          }
          .event-calendar-view .ant-picker-calendar-mini {
            border: 0;
            border-radius: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
