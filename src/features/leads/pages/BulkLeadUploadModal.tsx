import { useState } from "react";
import {
  Alert,
  Button,
  Col,
  Modal,
  Progress,
  Row,
  Statistic,
  Table,
  Tag,
  Upload,
  type TableColumnsType,
} from "antd";
import {
  DownloadOutlined,
  FileExcelOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { BulkLeadImportItem } from "../api/leadApi";
import { leadApi } from "../api/leadApi";
import { useMessageApi } from "@/shared/hooks";
import {
  downloadLeadImportTemplate,
  parseLeadImportWorkbook,
  type InvalidLeadImportRow,
  type LeadImportPreview,
} from "@/features/leads/utils/leadExcelImport";

const IMPORT_BATCH_SIZE = 400;

interface BulkLeadUploadModalProps {
  open: boolean;
  outletId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ImportOutcome {
  created: number;
  skippedDuplicates: number;
  complete: boolean;
}

const validColumns: TableColumnsType<BulkLeadImportItem> = [
  { title: "Row", dataIndex: "rowNumber", width: 70 },
  { title: "Name", dataIndex: "customerName", ellipsis: true },
  { title: "Mobile", dataIndex: "mobile", width: 125 },
  { title: "City", dataIndex: "city", ellipsis: true },
  {
    title: "Source",
    dataIndex: "source",
    width: 105,
    render: (source: string) => (
      <Tag color={source === "Facebook" ? "blue" : source === "Instagram" ? "magenta" : "default"}>
        {source}
      </Tag>
    ),
  },
  { title: "Campaign", dataIndex: "leadCampaign", ellipsis: true },
];

const invalidColumns: TableColumnsType<InvalidLeadImportRow> = [
  { title: "Row", dataIndex: "rowNumber", width: 70 },
  { title: "Name", dataIndex: "name", ellipsis: true },
  { title: "Phone", dataIndex: "phone", width: 145 },
  {
    title: "Issue",
    dataIndex: "reasons",
    render: (reasons: string[]) => reasons.join(", "),
  },
];

export default function BulkLeadUploadModal({
  open,
  outletId,
  onClose,
  onImported,
}: BulkLeadUploadModalProps) {
  const messageApi = useMessageApi();
  const [preview, setPreview] = useState<LeadImportPreview | null>(null);
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const reset = () => {
    setPreview(null);
    setParseError("");
    setParsing(false);
    setProgress(0);
    setOutcome(null);
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const parseFile = async (file: File) => {
    setParsing(true);
    setParseError("");
    setPreview(null);
    setOutcome(null);
    setProgress(0);

    try {
      setPreview(await parseLeadImportWorkbook(file));
    } catch (error) {
      setParseError(
        error instanceof Error ? error.message : "Unable to read the Excel workbook.",
      );
    } finally {
      setParsing(false);
    }
  };

  const importLeads = async () => {
    if (!preview?.validRows.length || !outletId) return;

    setImporting(true);
    setOutcome(null);
    setProgress(0);
    let created = 0;
    let skippedDuplicates = 0;

    try {
      for (
        let index = 0;
        index < preview.validRows.length;
        index += IMPORT_BATCH_SIZE
      ) {
        const batch = preview.validRows.slice(index, index + IMPORT_BATCH_SIZE);
        const result = await leadApi.createBulkLeads(outletId, batch);
        created += result.created;
        skippedDuplicates += result.skippedDuplicates;
        setProgress(
          Math.round(
            (Math.min(index + batch.length, preview.validRows.length) /
              preview.validRows.length) *
              100,
          ),
        );
      }

      setOutcome({ created, skippedDuplicates, complete: true });
      onImported();
      messageApi.success(
        `${created} lead${created === 1 ? "" : "s"} imported successfully.`,
      );
    } catch (error) {
      if (created > 0) onImported();
      setOutcome({ created, skippedDuplicates, complete: false });
      messageApi.error(
        error instanceof Error
          ? error.message
          : "The bulk lead import could not be completed.",
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <div className="flex items-center gap-2">
          <FileExcelOutlined className="text-emerald-600" />
          <span>Bulk Lead Upload</span>
        </div>
      }
      onCancel={close}
      width={1000}
      maskClosable={!importing}
      closable={!importing}
      footer={[
        <Button key="template" icon={<DownloadOutlined />} onClick={() => void downloadLeadImportTemplate()}>
          Download Format
        </Button>,
        <Button key="close" disabled={importing} onClick={close}>
          {outcome ? "Done" : "Cancel"}
        </Button>,
        <Button
          key="import"
          type="primary"
          icon={<UploadOutlined />}
          loading={importing}
          disabled={!preview?.validRows.length || outcome?.complete === true}
          onClick={() => void importLeads()}
        >
          Import {preview?.validRows.length ?? 0} Valid Leads
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="Supported Facebook and Instagram lead export format"
        description="Required columns: id, created_time, ad and campaign fields, platform, full_name, phone_number, city and inbox_url. Imported records are created as New leads. Re-uploaded lead IDs are skipped safely."
      />

      {!preview && (
        <Upload.Dragger
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple={false}
          maxCount={1}
          fileList={[]}
          disabled={parsing || importing}
          beforeUpload={(file) => {
            void parseFile(file as File);
            return false;
          }}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon">
            <FileExcelOutlined className="!text-emerald-600" />
          </p>
          <p className="ant-upload-text">
            {parsing ? "Reading workbook…" : "Click or drag the .xlsx lead file here"}
          </p>
          <p className="ant-upload-hint">Maximum file size: 10 MB</p>
        </Upload.Dragger>
      )}

      {parseError && (
        <Alert
          type="error"
          showIcon
          closable
          className="mt-4"
          message="Excel validation failed"
          description={parseError}
          onClose={() => setParseError("")}
        />
      )}

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <div className="font-semibold text-slate-900">{preview.fileName}</div>
              <div className="text-xs text-slate-500">Sheet: {preview.worksheetName}</div>
            </div>
            <Button disabled={importing} onClick={reset}>Choose Another File</Button>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={8}>
              <Statistic title="Excel Rows" value={preview.totalRows} />
            </Col>
            <Col xs={8}>
              <Statistic valueStyle={{ color: "#15803d" }} title="Valid" value={preview.validRows.length} />
            </Col>
            <Col xs={8}>
              <Statistic valueStyle={{ color: "#b91c1c" }} title="Invalid / Skipped" value={preview.invalidRows.length} />
            </Col>
          </Row>

          {importing && <Progress percent={progress} status="active" />}

          {outcome && (
            <Alert
              type={outcome.complete ? "success" : "warning"}
              showIcon
              message={outcome.complete ? "Bulk import completed" : "Bulk import stopped before completion"}
              description={`${outcome.created} created in this attempt, ${outcome.skippedDuplicates} duplicate lead IDs skipped, and ${preview.invalidRows.length} invalid Excel rows not imported.${outcome.complete ? "" : " You can retry safely; already imported lead IDs will be skipped."}`}
            />
          )}

          <div>
            <div className="mb-2 font-semibold text-slate-900">Valid Lead Preview</div>
            <Table<BulkLeadImportItem>
              rowKey={(row) => `${row.externalId}:${row.rowNumber}`}
              size="small"
              columns={validColumns}
              dataSource={preview.validRows}
              scroll={{ x: 760 }}
              pagination={{ defaultPageSize: 5, pageSizeOptions: [5, 10, 20], showSizeChanger: true }}
            />
          </div>

          {preview.invalidRows.length > 0 && (
            <div>
              <div className="mb-2 font-semibold text-red-700">Rows That Will Be Skipped</div>
              <Table<InvalidLeadImportRow>
                rowKey={(row) => String(row.rowNumber)}
                size="small"
                columns={invalidColumns}
                dataSource={preview.invalidRows}
                pagination={{ defaultPageSize: 5, pageSizeOptions: [5, 10, 20], showSizeChanger: true }}
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
