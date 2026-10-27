import { Button, DatePicker, Input, Select, Switch } from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import FilterCard from "@/shared/components/ui/FilterCard";
import type { TeamTreeDTO } from "@/features/team";
import type { TaskPriority, TaskStatus } from "../api/taskApi";

export interface TaskFiltersValue {
  search?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: string;
  overdue?: boolean;
}

interface Props {
  value: TaskFiltersValue;
  assignees: TeamTreeDTO[];
  onChange: (next: TaskFiltersValue) => void;
}

const statuses: TaskStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];
const priorities: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export default function TaskFilters({ value, assignees, onChange }: Props) {
  const [search, setSearch] = useState(value.search ?? "");
  useEffect(() => setSearch(value.search ?? ""), [value.search]);
  const set = (changes: Partial<TaskFiltersValue>) => onChange({ ...value, ...changes });
  const active = [value.search, value.status, value.priority, value.assignedTo, value.dueDate, value.overdue].filter(Boolean).length;

  return (
    <FilterCard activeFilterCount={active}>
      <div className="task-filters-grid">
        <DatePicker
          value={value.dueDate ? dayjs(value.dueDate) : null}
          onChange={(date) => set({ dueDate: date?.format("YYYY-MM-DD") })}
          allowClear
          placeholder="Due date"
        />
        <Select allowClear placeholder="Status" value={value.status} onChange={(status) => set({ status })}
          options={statuses.map((status) => ({ value: status, label: status.replaceAll("_", " ") }))} />
        <Select allowClear placeholder="Priority" value={value.priority} onChange={(priority) => set({ priority })}
          options={priorities.map((priority) => ({ value: priority, label: priority }))} />
        <Select showSearch allowClear optionFilterProp="label" placeholder="Assignee" value={value.assignedTo}
          onChange={(assignedTo) => set({ assignedTo })}
          options={assignees.map((member) => ({ value: member.userProfileId, label: member.userName }))} />
        <Input.Search className="task-filter-search" allowClear placeholder="Search title or task #" value={search}
          onSearch={(term) => set({ search: term.trim() || undefined })}
          onChange={(event) => {
            setSearch(event.target.value);
            if (!event.target.value) set({ search: undefined });
          }} />
        <span className="task-filter-overdue">Overdue <Switch checked={value.overdue} onChange={(overdue) => set({ overdue, dueDate: overdue ? undefined : value.dueDate })} /></span>
        <Button onClick={() => onChange({})}>Clear</Button>
      </div>
    </FilterCard>
  );
}
