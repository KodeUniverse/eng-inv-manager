import { useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveBoxPlot, type ComputedBoxPlotSummary } from "@nivo/boxplot";
import {
  Alert,
  Box,
  Card,
  Grid,
  Group,
  Loader,
  Stack,
  Switch,
  Tabs,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { gridThemes } from "../agGrid";
import { getJson } from "../api";
import type { SoldPart } from "../types";

const PAGE_SIZE = 15;
const MARGIN_AXIS = { min: -100, max: 100 };
const WEAK_MARGIN_PCT = 20;
const MIN_SALES = 5;
const NEGATIVE_COLOR = "#fa5252";
const WEAK_COLOR = "#fab005";
const STRONG_COLOR = "#40c057";

type MarginPoint = { module: string; sub_type: string; margin_pct: number };

function formatNumber(value: number | null) {
  return value === null
    ? ""
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function marginCellStyle(value: number | null) {
  if (value == null) return null;
  if (value < 0) return { color: NEGATIVE_COLOR };
  return { color: value < WEAK_MARGIN_PCT ? WEAK_COLOR : STRONG_COLOR };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

type PartSummary = {
  part: string;
  description: string;
  sales: number;
  median_margin: number | null;
  weak_share: number | null;
  enough_sales: boolean;
};

function summarizeParts(rows: SoldPart[]): PartSummary[] {
  const byPart = new Map<string, SoldPart[]>();
  for (const row of rows) {
    byPart.set(row.part, [...(byPart.get(row.part) ?? []), row]);
  }

  const summaries = [...byPart.entries()].map(([part, sales]) => {
    const margins = sales.flatMap((sale) =>
      sale.margin === null ? [] : [sale.margin * 100],
    );
    const weak = margins.filter((margin) => margin < WEAK_MARGIN_PCT).length;
    return {
      part,
      description: sales[0].description,
      sales: sales.length,
      median_margin: margins.length ? median(margins) : null,
      weak_share: margins.length ? (weak / margins.length) * 100 : null,
      enough_sales: sales.length >= MIN_SALES,
    };
  });

  return summaries.sort((a, b) => {
    if (a.enough_sales !== b.enough_sales) return a.enough_sales ? -1 : 1;
    return (a.median_margin ?? Infinity) - (b.median_margin ?? Infinity);
  });
}

function MarginBoxPlot({
  title,
  rows,
  groupBy,
  groupLabel,
}: {
  title: string;
  rows: MarginPoint[];
  groupBy: "module" | "sub_type";
  groupLabel: string;
}) {
  const colorScheme = useComputedColorScheme("dark");
  const theme = useMantineTheme();
  const primary = theme.colors[theme.primaryColor][6];
  const median =
    colorScheme === "dark" ? theme.colors.gray[2] : theme.colors.gray[8];
  const textColor = colorScheme === "dark" ? "#c1c2c5" : "#212529";
  const gridColor = colorScheme === "dark" ? "#373a40" : "#dee2e6";
  const [hovered, setHovered] = useState<ComputedBoxPlotSummary | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const trackPointer = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
  };

  return (
    <Card withBorder>
      <Title order={4}>{title}</Title>
      <Box h={320} mt="md" pos="relative" onMouseMove={trackPointer}>
        <ResponsiveBoxPlot
          data={rows}
          groupBy={groupBy}
          value="margin_pct"
          minValue={MARGIN_AXIS.min}
          maxValue={MARGIN_AXIS.max}
          valueFormat={(value) => `${value.toFixed(0)}%`}
          colors={[primary]}
          medianColor={median}
          margin={{ top: 16, right: 16, bottom: 56, left: 72 }}
          axisLeft={{
            format: (value) => `${value}%`,
            legend: "Repair margin",
            legendPosition: "middle",
            legendOffset: -52,
          }}
          axisBottom={{
            legend: groupLabel,
            legendPosition: "middle",
            legendOffset: 40,
          }}
          theme={{
            text: { fill: textColor },
            grid: { line: { stroke: gridColor } },
            axis: { legend: { text: { fill: textColor } } },
            translation: {},
          }}
          tooltip={() => null}
          onMouseEnter={(datum) => setHovered(datum)}
          onMouseLeave={() => setHovered(null)}
        />
        {hovered && (
          <Card
            bg="white"
            withBorder
            shadow="sm"
            p="xs"
            style={{
              position: "absolute",
              left: pointer.x + 12,
              top: pointer.y + 12,
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <Text fw={600} c="dark.9">
              {hovered.group}
            </Text>
            <Text size="sm" c="dark.9">
              Sales: {hovered.formatted.n}
            </Text>
            <Text size="sm" c="dark.9">
              Median: {hovered.formatted.values[2]}
            </Text>
            <Text size="sm" c="dark.9">
              Middle 50%: {hovered.formatted.values[1]} to{" "}
              {hovered.formatted.values[3]}
            </Text>
            <Text size="sm" c="dark.9">
              Whiskers (10th to 90th): {hovered.formatted.values[0]} to{" "}
              {hovered.formatted.values[4]}
            </Text>
          </Card>
        )}
      </Box>
    </Card>
  );
}

const columns: ColDef<SoldPart>[] = [
  {
    field: "part",
    headerName: "Part No.",
    width: 120,
    filter: "agTextColumnFilter",
  },
  {
    field: "description",
    headerName: "Description",
    flex: 1,
    minWidth: 240,
    filter: "agTextColumnFilter",
  },
  {
    field: "module",
    headerName: "Module",
    width: 100,
    filter: "agTextColumnFilter",
  },
  {
    field: "sub_type",
    headerName: "SubType",
    width: 100,
    filter: "agTextColumnFilter",
  },
  {
    field: "invoice_date",
    headerName: "Invoice date",
    width: 110,
    filter: "agTextColumnFilter",
  },
  {
    field: "destination_country",
    headerName: "Destination",
    width: 130,
    filter: "agTextColumnFilter",
  },
  {
    field: "qty",
    headerName: "Qty",
    width: 70,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
  },
  {
    field: "unit_sales_price",
    headerName: "Unit sales price",
    width: 120,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) => formatNumber(value),
  },
  {
    field: "repair_unit_cost",
    headerName: "Unit repair cost",
    width: 120,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) => formatNumber(value),
  },
  {
    colId: "margin",
    headerName: "Repair margin",
    width: 120,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueGetter: ({ data }) =>
      data?.margin == null ? null : data.margin * 100,
    valueFormatter: ({ value }) =>
      value == null ? "" : `${Number(value).toFixed(1)}%`,
    cellStyle: ({ value }) => marginCellStyle(value),
  },
  {
    field: "margin_note",
    headerName: "Repair margin note",
    width: 180,
    filter: "agTextColumnFilter",
  },
];

function SoldPartsTable({ rows }: { rows: SoldPart[] }) {
  const colorScheme = useComputedColorScheme("dark");
  const [hideNoMargin, setHideNoMargin] = useState(false);
  const [weakOnly, setWeakOnly] = useState(false);
  const isWeak = (row: SoldPart) =>
    row.margin !== null && row.margin * 100 < WEAK_MARGIN_PCT;
  const shown = weakOnly
    ? rows.filter(isWeak).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0))
    : hideNoMargin
      ? rows.filter((row) => row.margin !== null)
      : rows;

  return (
    <Card withBorder>
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={4}>Sold part records</Title>
          <Text size="sm" c="dimmed">
            Repair margin = (unit sales price − unit repair cost) ÷ unit sales
            price. Sales with no repair cost or a non-positive sales price have
            no margin.
          </Text>
        </Stack>
        <Group>
          <Switch
            label="Hide sales without a repair margin"
            checked={hideNoMargin}
            onChange={(event) => setHideNoMargin(event.currentTarget.checked)}
          />
          <Switch
            label={`Show weakest margins (below ${WEAK_MARGIN_PCT}%)`}
            checked={weakOnly}
            onChange={(event) => setWeakOnly(event.currentTarget.checked)}
          />
        </Group>
      </Group>
      <Box mt="md">
        <AgGridReact<SoldPart>
          theme={gridThemes[colorScheme]}
          rowData={shown}
          columnDefs={columns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination
          paginationPageSize={PAGE_SIZE}
          paginationPageSizeSelector={false}
          domLayout="autoHeight"
        />
      </Box>
    </Card>
  );
}

const partColumns: ColDef<PartSummary>[] = [
  {
    field: "part",
    headerName: "Part No.",
    width: 120,
    filter: "agTextColumnFilter",
  },
  {
    field: "description",
    headerName: "Description",
    flex: 1,
    minWidth: 240,
    filter: "agTextColumnFilter",
  },
  {
    field: "sales",
    headerName: "Sales",
    width: 90,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
  },
  {
    field: "median_margin",
    headerName: "Median repair margin",
    width: 180,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) =>
      value == null ? "" : `${Number(value).toFixed(1)}%`,
    cellStyle: ({ value }) => marginCellStyle(value),
  },
  {
    field: "weak_share",
    headerName: "Weak sales",
    width: 120,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) =>
      value == null ? "" : `${Number(value).toFixed(0)}%`,
  },
];

function PartsToReviewTable({ rows }: { rows: SoldPart[] }) {
  const colorScheme = useComputedColorScheme("dark");
  const parts = summarizeParts(rows);

  return (
    <Card withBorder>
      <Title order={4}>Per-part margin</Title>
      <Text size="sm" c="dimmed">
        One row per part number, ordered by median repair margin, weakest first. Weak sales (&lt;{WEAK_MARGIN_PCT}%) is the
        share of sales with a margin below {WEAK_MARGIN_PCT}%. Parts with fewer than {MIN_SALES} sales are listed last.
      </Text>
      <Box mt="md">
        <AgGridReact<PartSummary>
          theme={gridThemes[colorScheme]}
          rowData={parts}
          columnDefs={partColumns}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          pagination
          paginationPageSize={PAGE_SIZE}
          paginationPageSizeSelector={false}
          domLayout="autoHeight"
        />
      </Box>
    </Card>
  );
}

export default function RepairEconomicsView() {
  const sold = useQuery({
    queryKey: ["parts", "sold"],
    queryFn: () => getJson<SoldPart[]>("/parts/sold"),
  });

  if (sold.isError) {
    return (
      <Alert color="red" title="Could not load sold parts">
        Check that the backend is running and that cleaning.py has been run.
      </Alert>
    );
  }
  if (!sold.data) {
    return <Loader />;
  }

  const withMargin = sold.data.flatMap((row): MarginPoint[] =>
    row.margin === null
      ? []
      : [
          {
            module: row.module,
            sub_type: row.sub_type,
            margin_pct: row.margin * 100,
          },
        ],
  );

  const outside = withMargin.filter(
    (row) =>
      row.margin_pct < MARGIN_AXIS.min || row.margin_pct > MARGIN_AXIS.max,
  ).length;

  return (
    <Stack>
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <MarginBoxPlot
            title="Repair margin by Module"
            rows={withMargin}
            groupBy="module"
            groupLabel="Module"
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <MarginBoxPlot
            title="Repair margin by SubType"
            rows={withMargin}
            groupBy="sub_type"
            groupLabel="SubType"
          />
        </Grid.Col>
      </Grid>
      <Card withBorder>
        <Text size="sm" c="dimmed">
          <strong>Note:</strong> Whiskers show the 10th and 90th percentiles.
          Axis limited to {MARGIN_AXIS.min}% to {MARGIN_AXIS.max}%. {outside}{" "}
          sales fall outside this range and are not shown.
        </Text>
      </Card>
      <Tabs defaultValue="per-part" variant="default">
        <Tabs.List>
          <Tabs.Tab value="per-part">Per-part margin</Tabs.Tab>
          <Tabs.Tab value="records">Sold part records</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="per-part" pt="md">
          <PartsToReviewTable rows={sold.data} />
        </Tabs.Panel>
        <Tabs.Panel value="records" pt="md">
          <SoldPartsTable rows={sold.data} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
