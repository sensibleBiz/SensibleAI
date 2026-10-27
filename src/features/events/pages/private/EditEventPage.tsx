import { useEffect, useState } from "react";
import { Card, Empty, message } from "antd";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import EventForm from "@/features/events/components/EventForm";
import { getEventById, updateEvent } from "@/features/events/api/eventApi";
import { RootState } from "@/app/store";
import { EventFormValues, EventItem } from "../../types/eventTypes";

export default function EditEventPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadEvent = async () => {
      setLoading(true);
      const data = await getEventById(eventId, outletId);
      setEvent(data ?? null);
      setLoading(false);
    };

    loadEvent();
  }, [eventId, outletId]);

  const handleUpdate = async (values: EventFormValues) => {
    setSaving(true);
    try {
      await updateEvent(eventId, values, outletId);
      message.success("Event updated successfully");
      navigate(`/events/${eventId}`);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to update event"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!loading && !event) {
    return (
      <Card>
        <Empty description="Event not found" />
      </Card>
    );
  }

  return (
    <Card loading={loading}>
      {event && (
        <>
          <div className="mb-5">
            <h1 className="m-0 text-2xl font-semibold text-slate-900">Edit Event</h1>
            <p className="m-0 text-sm text-slate-500">Update event details and registration settings.</p>
          </div>
          <EventForm
            initialValues={event}
            submitLabel="Update Event"
            loading={saving}
            onCancel={() => navigate(`/events/${event.id}`)}
            onSubmit={handleUpdate}
          />
        </>
      )}
    </Card>
  );
}
