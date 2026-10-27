import { useEffect, useState, useCallback, useRef } from 'react'
import { Alert, Avatar, Badge, Button, Card, DatePicker, Empty, Space, Table, Tag, Typography } from 'antd'
import { EnvironmentOutlined, PhoneOutlined, PhoneFilled } from '@ant-design/icons'
import dayjs, { Dayjs } from 'dayjs'
import { useSelector } from 'react-redux'
import { RootState } from '@/app/store'
import { LeadsManagement } from "../types/types";
import SpinLoader from '@/shared/components/SpinLoader'
import { useMessageApi } from '@/shared/hooks'
import { formatLeadStatusLabel, toTitleCase } from '@/shared/utils/helperFunctions'
import { leadApi } from "../api/leadApi";

const { RangePicker } = DatePicker
const { Title, Text } = Typography

const RINGING_LEADS_LIMIT = 5
const BRAND_NAVY = '#0a3750'
const BRAND_RED = '#ff3228'

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

const RingingStatusLeads = () => {
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [leads, setLeads] = useState<LeadsManagement[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatingLeadIds, setUpdatingLeadIds] = useState<Set<string>>(new Set())
  const loadMoreInFlight = useRef(false)
  const updatesInFlight = useRef(new Set<string>())
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  )
  const messageApi = useMessageApi()
  // Default date range: current month
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ])

  const startDate = dateRange[0].startOf('day').valueOf()
  const endDate = dateRange[1].endOf('day').valueOf()

  useEffect(() => {
    if (!outletId) {
      setLoading(false)
      setLeads([])
      setNextCursor(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setNextCursor(null)

    void leadApi
      .getRingingLeads(
        { outletId, startDate, endDate, limit: RINGING_LEADS_LIMIT },
        controller.signal
      )
      .then((result) => {
        setLeads(result.items)
        setNextCursor(result.nextCursor)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return
        setLeads([])
        setNextCursor(null)
        setError(requestError instanceof Error ? requestError.message : 'Failed to fetch leads')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [outletId, startDate, endDate])

  const loadMore = async () => {
    if (!outletId || !nextCursor || loadMoreInFlight.current) return

    loadMoreInFlight.current = true
    setLoadingMore(true)
    setError(null)
    try {
      const result = await leadApi.getRingingLeads({
        outletId,
        startDate,
        endDate,
        limit: RINGING_LEADS_LIMIT,
        cursor: nextCursor,
      })
      setLeads((current) => {
        const existingIds = new Set(current.map((lead) => lead.id))
        return [...current, ...result.items.filter((lead) => !existingIds.has(lead.id))]
      })
      setNextCursor(result.nextCursor)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load more leads')
    } finally {
      loadMoreInFlight.current = false
      setLoadingMore(false)
    }
  }

  const onDateRangeChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates[1]) {
      setDateRange([dates[0], dates[1]])
    }
  }, [])

  const handleStatusChange = async (leadId: string) => {
    if (!outletId) {
      messageApi.error('Outlet ID not found')
      return
    }

    if (updatesInFlight.current.has(leadId)) return
    updatesInFlight.current.add(leadId)
    setUpdatingLeadIds(new Set(updatesInFlight.current))

    try {
      await leadApi.setRinging(outletId, leadId, false)
      setLeads((current) => current.filter((lead) => lead.id !== leadId))
      messageApi.success('Status updated successfully')
    } catch (requestError) {
      messageApi.error(requestError instanceof Error ? requestError.message : 'Failed to update status')
    } finally {
      updatesInFlight.current.delete(leadId)
      setUpdatingLeadIds(new Set(updatesInFlight.current))
    }
  }

  // Table columns
  const columns = [
    {
      title: 'Name',
      dataIndex: 'username',
      key: 'username',
      render: (text: string) => {
        const name = toTitleCase(text, 'N/A')
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              size={32}
              style={{
                backgroundColor: `${BRAND_NAVY}14`,
                color: BRAND_NAVY,
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {getInitials(name === 'N/A' ? '?' : name)}
            </Avatar>
            <Text strong>{name}</Text>
          </div>
        )
      },
    },
    {
      title: 'Mobile',
      dataIndex: 'mobile',
      key: 'mobile',
      render: (text: string) => (
        <Space size={6}>
          <PhoneOutlined className="text-slate-400" />
          <Text>{text || 'N/A'}</Text>
        </Space>
      ),
    },
    {
      title: 'Location',
      key: 'location',
      render: (_: unknown, record: LeadsManagement) => (
        <Space size={6}>
          <EnvironmentOutlined className="text-slate-400" />
          <Text>
            {record.city && record.state
              ? `${toTitleCase(record.city)}, ${toTitleCase(record.state)}`
              : toTitleCase(record.city || record.state, 'N/A')}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'source',
      key: 'source',
      render: (text: string) => (
        <Tag color="blue" className="!rounded-full">
          {toTitleCase(text, 'N/A')}
        </Tag>
      ),
    },
    {
      title: 'Date',
      key: 'date',
      render: (_: unknown, record: LeadsManagement) => {
        const ms = record.createdDate || record.updatedDate;
        const label = ms ? dayjs(ms).format('DD MMM, YYYY') : 'N/A';
        return <Text className="text-[13px]">{label}</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge
          status="processing"
          color={BRAND_RED}
          text={
            <Tag color="orange" className="!m-0 !rounded-full">
              {formatLeadStatusLabel(status, 'N/A')}
            </Tag>
          }
        />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: unknown, record: LeadsManagement) => (
        <Button
          type="primary"
          danger
          size="small"
          className="!rounded-lg"
          loading={updatingLeadIds.has(record.id)}
          disabled={updatingLeadIds.has(record.id)}
          onClick={() => handleStatusChange(record.id)}
        >
          Remove Ringing Status
        </Button>
      ),
    },
  ]

  if (loading) {
    return <SpinLoader loading={loading} />
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <PhoneFilled style={{ color: BRAND_RED, fontSize: 18 }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Ringing Status Leads
              </Title>
              <Text className="text-slate-200 !text-white">
                Leads still marked as ringing — clear them once contact is made.
              </Text>
            </div>
          </div>

          <Space>
            <RangePicker
              value={dateRange}
              onChange={onDateRangeChange}
              format="DD MMM, YYYY"
              allowClear={false}
              disabledDate={(current) => current && current > dayjs()}
            />
          </Space>
        </div>
      </div>

      <Card className="!rounded-xl border-0 shadow-sm" styles={{ body: { padding: 20 } }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Space size={8}>
            <span
              className="inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BRAND_RED }}
            />
            <Text strong className="text-[15px]">
              Ringing Leads
            </Text>
            <Badge count={leads.length} showZero color={BRAND_RED} />
          </Space>
        </div>

        {error && (
          <Alert
            className="mb-4 !rounded-xl"
            type="error"
            showIcon
            message="Unable to load ringing leads"
            description={error}
          />
        )}

        {leads.length === 0 ? (
          <Empty description="No ringing leads found for the selected date range" className="py-10" />
        ) : (
          <>
            <Table
              columns={columns}
              dataSource={leads}
              rowKey="id"
              size="middle"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Loaded ${total} leads`,
              }}
            />
            {nextCursor && (
              <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
                <Button onClick={() => void loadMore()} loading={loadingMore} disabled={loadingMore}>
                  Load more leads
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

export default RingingStatusLeads