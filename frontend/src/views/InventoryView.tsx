import { useQuery } from '@tanstack/react-query'
import { Alert, Box, Card, Grid, Loader, Stack, Text, Title, useComputedColorScheme, useMantineTheme } from '@mantine/core'
import { type ColDef } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { gridThemes } from '../agGrid'
import { getJson } from '../api'
import type { InventoryGroup, SellGroup, SellThroughSummary } from '../types'

const PAGE_SIZE = 15

function SellTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SellGroup }> }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const signed = (days: number) => `${days > 0 ? '+' : ''}${days} days`
  return (
    <Card withBorder shadow="sm" p="xs">
      <Text fw={600}>{row.name}</Text>
      <Text size="sm">Sales: {row.count}</Text>
      <Text size="sm">Difference vs expected — median: {signed(row.median_days)}, mean: {signed(row.mean_days)}</Text>
      <Text size="sm">Median actual days to sell: {row.median_actual_days}</Text>
      <Text size="sm">Median expected days: {row.median_expected_days}</Text>
    </Card>
  )
}

function SellDaysChart({ dimension, groups }: { dimension: string; groups: SellGroup[] }) {
  const colorScheme = useComputedColorScheme('dark')
  const theme = useMantineTheme()
  const actualColor = theme.colors[theme.primaryColor][6]
  const expectedColor = theme.colors.red[6]
  const textColor = colorScheme === 'dark' ? '#c1c2c5' : '#212529'
  const gridColor = colorScheme === 'dark' ? '#373a40' : '#dee2e6'
  const days = groups.flatMap((group) => [group.median_actual_days, group.median_expected_days])
  const domain = [0, Math.max(...days) + Math.max(2, (Math.max(...days) - Math.min(...days)) * 0.08)]

  return (
    <Card withBorder>
      <Title order={4}>Actual vs expected days to sell, {dimension}</Title>
      <Box h={240} mt="md">
        <ResponsiveContainer>
          <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 8 }}>
            <XAxis
              type="number"
              domain={domain}
              tick={{ fill: textColor, fontSize: 12 }}
              axisLine={{ stroke: gridColor }}
              tickLine={false}
              tickFormatter={(value: number) => `${value}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              reversed
              tick={{ fill: textColor, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: gridColor }}
            />
            <Tooltip content={<SellTooltip />} cursor={false} />
            <Legend formatter={(value: string) => <Text span size="sm" c={colorScheme === 'dark' ? 'gray.2' : 'dark.6'}>{value}</Text>} />
            <Bar name="Median expected" dataKey="median_expected_days" barSize={14} fill={expectedColor} />
            <Bar name="Median actual" dataKey="median_actual_days" barSize={14} fill={actualColor} />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  )
}

const columns: ColDef<InventoryGroup>[] = [
  { field: 'module', headerName: 'Module', flex: 1, minWidth: 130, filter: 'agTextColumnFilter' },
  { field: 'sub_type', headerName: 'SubType', flex: 1, minWidth: 130, filter: 'agTextColumnFilter' },
  { field: 'whse', headerName: 'Warehouse', flex: 1, minWidth: 130, filter: 'agTextColumnFilter' },
  { field: 'condition', headerName: 'Condition', flex: 1, minWidth: 120, filter: 'agTextColumnFilter' },
  { field: 'parts', headerName: 'Parts', width: 130, type: 'rightAligned', filter: 'agNumberColumnFilter', sort: 'desc' },
  { field: 'qty', headerName: 'Qty on hand', width: 130, type: 'rightAligned', filter: 'agNumberColumnFilter' },
]

export default function InventoryView() {
  const inventory = useQuery({
    queryKey: ['parts', 'inventory'],
    queryFn: () => getJson<InventoryGroup[]>('/parts/inventory'),
  })
  const sellthrough = useQuery({
    queryKey: ['sellthrough'],
    queryFn: () => getJson<SellThroughSummary>('/sellthrough/summary'),
  })
  const colorScheme = useComputedColorScheme('dark')

  if (inventory.isError || sellthrough.isError) {
    return (
      <Alert color="red" title="Could not load inventory data">
        Check that the backend is running and that cleaning.py has been run.
      </Alert>
    )
  }
  if (!inventory.data || !sellthrough.data) {
    return <Loader />
  }

  const blankQty = inventory.data.filter((row) => row.qty === null).length
  const totalQty = inventory.data.reduce((sum, row) => sum + (row.qty ?? 0), 0)

  return (
    <Stack>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SellDaysChart dimension="by Module" groups={sellthrough.data.module} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SellDaysChart dimension="by SubType" groups={sellthrough.data.sub_type} />
        </Grid.Col>
        <Grid.Col span={12}>
          <Card withBorder>
            <Title order={4}>On-hand inventory</Title>
            <Text size="sm" c="dimmed">
              Quantity on hand by Module, SubType, warehouse, and condition. {blankQty} of {inventory.data.length} groups
              have no recorded quantity. Total: {Math.round(totalQty).toLocaleString('en-US')} units.
            </Text>
            <Box mt="md">
              <AgGridReact<InventoryGroup>
                theme={gridThemes[colorScheme]}
                rowData={inventory.data}
                columnDefs={columns}
                defaultColDef={{ sortable: true, filter: true, resizable: true, wrapHeaderText: true, autoHeaderHeight: true }}
                pagination
                paginationPageSize={PAGE_SIZE}
                paginationPageSizeSelector={false}
                domLayout="autoHeight"
              />
            </Box>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
