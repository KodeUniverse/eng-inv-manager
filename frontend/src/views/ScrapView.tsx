import { useQuery } from '@tanstack/react-query'
import { BarChart, PieChart, type PieChartCell } from '@mantine/charts'
import { Alert, Badge, Box, Card, Grid, Group, Loader, Stack, Text, Title, useComputedColorScheme } from '@mantine/core'
import { AllCommunityModule, colorSchemeDark, colorSchemeLight, ModuleRegistry, themeQuartz, type ColDef, type IRowNode, type ICellRendererParams } from 'ag-grid-community'
import { AgGridReact } from 'ag-grid-react'
import { getJson } from '../api'
import type { ScrapGroup, ScrapPart, ScrapSummary } from '../types'

ModuleRegistry.registerModules([AllCommunityModule])

const MIN_RECORDS = 5
const PAGE_SIZE = 15
const PIE_COLORS = ['blue.6', 'teal.6', 'orange.6', 'grape.6', 'red.6', 'cyan.6', 'gray.6']
const darkTheme = themeQuartz.withPart(colorSchemeDark)
const lightTheme = themeQuartz.withPart(colorSchemeLight)

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function rateSort(a: number, b: number, nodeA: IRowNode<ScrapPart>, nodeB: IRowNode<ScrapPart>, isDescending: boolean) {
  const eligibleA = nodeA.data?.enough_records ?? false
  const eligibleB = nodeB.data?.enough_records ?? false
  if (eligibleA !== eligibleB) {
    const eligibleFirst = eligibleA ? -1 : 1
    return isDescending ? -eligibleFirst : eligibleFirst
  }
  return a - b
}

function RateCell({ value, data }: ICellRendererParams<ScrapPart>) {
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap">
      <Text size="sm">{Number(value).toFixed(1)}%</Text>
      {data && !data.enough_records && (
        <Badge color="gray" variant="light" size="sm">
          Low sample
        </Badge>
      )}
    </Group>
  )
}

const columns: ColDef<ScrapPart>[] = [
  { field: 'part', headerName: 'Part number', filter: 'agTextColumnFilter' },
  { field: 'description', headerName: 'Description', filter: 'agTextColumnFilter', flex: 1 },
  { field: 'scrapped', headerName: 'Scrapped', type: 'rightAligned', filter: 'agNumberColumnFilter' },
  { field: 'total', headerName: 'Total records', type: 'rightAligned', filter: 'agNumberColumnFilter' },
  {
    colId: 'scrap_rate',
    headerName: 'Scrap rate',
    type: 'rightAligned',
    filter: 'agNumberColumnFilter',
    valueGetter: ({ data }) => (data ? data.scrap_rate * 100 : null),
    comparator: rateSort,
    cellRenderer: RateCell,
  },
]

function RateBarChart({ title, groups }: { title: string; groups: ScrapGroup[] }) {
  const data = groups.map((group) => ({
    name: group.name,
    scrap_rate: Number((group.scrap_rate * 100).toFixed(1)),
    scrapped: group.scrapped,
    total: group.total,
  }))

  return (
    <Card withBorder>
      <Title order={4}>{title}</Title>
      <BarChart
        h={260}
        mt="md"
        data={data}
        dataKey="name"
        series={[{ name: 'scrap_rate', label: 'Scrap rate (%)', color: 'red.6' }]}
        withTooltip
        tooltipProps={{
          content: ({ active, payload }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload
            return (
              <Card withBorder shadow="sm" p="xs">
                <Text fw={600}>{row.name}</Text>
                <Text size="sm">Scrap rate: {row.scrap_rate}%</Text>
                <Text size="sm">
                  Scrapped: {row.scrapped} of {row.total} records
                </Text>
              </Card>
            )
          },
        }}
      />
    </Card>
  )
}

function SharePie({ title, groups }: { title: string; groups: ScrapGroup[] }) {
  const data: PieChartCell[] = groups
    .filter((group) => group.scrapped > 0)
    .map((group, index) => ({
      name: group.name,
      value: group.scrapped,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }))
  const totalScrapped = data.reduce((sum, cell) => sum + cell.value, 0)

  return (
    <Card withBorder>
      <Title order={4}>{title}</Title>
      <Group justify="center" mt="md">
        <PieChart
          data={data}
          size={220}
          withTooltip
          tooltipDataSource="segment"
          withLabels
          labelsType="percent"
          withLegend
          tooltipProps={{
            content: ({ active, payload }) => {
              if (!active || !payload?.length) return null
              const cell = payload[0]
              return (
                <Card withBorder shadow="sm" p="xs">
                  <Text fw={600}>{cell.name}</Text>
                  <Text size="sm">
                    {cell.value} scrapped ({percent(Number(cell.value) / totalScrapped)} of all scrap)
                  </Text>
                </Card>
              )
            },
          }}
        />
      </Group>
    </Card>
  )
}

function ScrapPartsTable({ parts }: { parts: ScrapPart[] }) {
  const colorScheme = useComputedColorScheme('dark')

  return (
    <Card withBorder>
      <Title order={4}>Most scrapped parts</Title>
      <Text size="sm" c="dimmed">
        Ranked by scrap rate. Parts with fewer than {MIN_RECORDS} records are listed last.
      </Text>
      <Box mt="md">
        <AgGridReact<ScrapPart>
          theme={colorScheme === 'dark' ? darkTheme : lightTheme}
          rowData={parts}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination
          paginationPageSize={PAGE_SIZE}
          paginationPageSizeSelector={false}
          domLayout="autoHeight"
        />
      </Box>
    </Card>
  )
}

export default function ScrapView() {
  const summary = useQuery({
    queryKey: ['parts', 'scrapped', 'summary'],
    queryFn: () => getJson<ScrapSummary>('/parts/scrapped/summary'),
  })
  const parts = useQuery({
    queryKey: ['parts', 'scrapped', MIN_RECORDS],
    queryFn: () => getJson<ScrapPart[]>(`/parts/scrapped?min_records=${MIN_RECORDS}`),
  })

  if (summary.isError || parts.isError) {
    return (
      <Alert color="red" title="Could not load scrap data">
        Check that the backend is running and that cleaning.py has been run.
      </Alert>
    )
  }
  if (!summary.data || !parts.data) {
    return <Loader />
  }

  return (
    <Stack>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <RateBarChart title="Scrap rate by Module" groups={summary.data.module} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <RateBarChart title="Scrap rate by SubType" groups={summary.data.sub_type} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SharePie title="Share of all scrap by Module" groups={summary.data.module} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <SharePie title="Share of all scrap by SubType" groups={summary.data.sub_type} />
        </Grid.Col>
        <Grid.Col span={12}>
          <ScrapPartsTable parts={parts.data} />
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
