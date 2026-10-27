import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { Col, Row } from "antd";
import StatCard from "@/shared/components/ui/StatCard";

export interface TaskDashboard {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  blocked: number;
}

const cards = [
  ["total", "Total", <UnorderedListOutlined key="total" />, "linear-gradient(135deg,#667eea,#764ba2)", "rgba(102,126,234,.2)"],
  ["pending", "Pending", <ClockCircleOutlined key="pending" />, "linear-gradient(135deg,#f6d365,#fda085)", "rgba(253,160,133,.2)"],
  ["inProgress", "In progress", <PauseCircleOutlined key="progress" />, "linear-gradient(135deg,#4facfe,#00f2fe)", "rgba(79,172,254,.2)"],
  ["completed", "Completed", <CheckCircleOutlined key="completed" />, "linear-gradient(135deg,#43e97b,#38f9d7)", "rgba(67,233,123,.2)"],
  ["overdue", "Overdue", <ExclamationCircleOutlined key="overdue" />, "linear-gradient(135deg,#fa709a,#fee140)", "rgba(250,112,154,.2)"],
  ["blocked", "Blocked", <StopOutlined key="blocked" />, "linear-gradient(135deg,#ff758c,#ff7eb3)", "rgba(255,117,140,.2)"],
] as const;

export default function TaskDashboardCards({ data }: { data: TaskDashboard }) {
  return (
    <Row className="task-dashboard-row" gutter={[12, 12]}>
      {cards.map(([key, title, icon, gradient, shadow]) => (
        <Col xs={12} md={8} xl={4} key={key}>
          <StatCard title={title} value={data[key]} icon={icon} gradient={gradient} shadowColor={shadow} />
        </Col>
      ))}
    </Row>
  );
}
