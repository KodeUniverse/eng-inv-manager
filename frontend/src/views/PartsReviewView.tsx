import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Box,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
} from "@mantine/core";
import { type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { gridThemes } from "../agGrid";
import { getJson } from "../api";
import type { ReviewPart } from "../types";

const PAGE_SIZE = 20;
const WEAK_MARGIN_PCT = 20;
const NEGATIVE_COLOR = "#fa5252";
const WEAK_COLOR = "#fab005";
const STRONG_COLOR = "#40c057";
const ACTION_COLORS: Record<string, string> = {
  "Repair & sell": STRONG_COLOR,
  "Pricing review": WEAK_COLOR,
  "Scrap candidate": NEGATIVE_COLOR,
  "Manual review": "#adb5bd",
};

function marginCellStyle(value: number | null) {
  if (value == null) return undefined;
  if (value < 0) return { color: NEGATIVE_COLOR };
  return { color: value < WEAK_MARGIN_PCT ? WEAK_COLOR : STRONG_COLOR };
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function SlowCell({ value, data }: ICellRendererParams<ReviewPart>) {
  return (
    <Group gap="xs" justify="flex-end" wrap="nowrap" style={{ height: "100%" }}>
      <Text size="sm" c={data?.slow ? NEGATIVE_COLOR : undefined}>
        {value == null ? "—" : `${Number(value).toFixed(0)}`}
      </Text>
      {data && !data.days_sampled && (
        <Badge color="gray" variant="light" size="sm">
          Low sample
        </Badge>
      )}
    </Group>
  );
}

const columns: ColDef<ReviewPart>[] = [
  {
    field: "part",
    headerName: "Part No.",
    width: 130,
    filter: "agTextColumnFilter",
  },
  {
    field: "description",
    headerName: "Description",
    filter: "agTextColumnFilter",
    flex: 1,
    minWidth: 200,
  },
  {
    field: "module",
    headerName: "Module",
    width: 110,
    filter: "agTextColumnFilter",
  },
  {
    field: "sub_type",
    headerName: "SubType",
    width: 120,
    filter: "agTextColumnFilter",
  },
  {
    field: "flags",
    headerName: "Flagged checks (0–3)",
    width: 150,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    cellStyle: ({ value }) =>
      value >= 2 ? { color: NEGATIVE_COLOR } : undefined,
  },
  {
    field: "action",
    headerName: "Suggested action",
    width: 130,
    filter: "agTextColumnFilter",
    cellStyle: ({ value }) => ({ color: ACTION_COLORS[value] ?? "#adb5bd" }),
  },
  {
    field: "qty_on_hand",
    headerName: "Qty on hand",
    width: 120,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
  },
  {
    field: "sales",
    headerName: "Sales",
    width: 90,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
  },
  {
    colId: "margin",
    headerName: "Median margin",
    width: 130,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueGetter: ({ data }) =>
      data?.median_margin == null ? null : data.median_margin * 100,
    valueFormatter: ({ value }) =>
      value == null ? "—" : `${Number(value).toFixed(1)}%`,
    cellStyle: ({ value }) => marginCellStyle(value),
  },
  {
    field: "avg_unit_repair_cost",
    headerName: "Avg unit repair cost",
    width: 130,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
  },
  {
    field: "exposure",
    headerName: "Estimated total repair cost",
    width: 160,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueFormatter: ({ value }) =>
      value == null ? "—" : `$${formatMoney(value)}`,
  },
  {
    field: "median_days_to_sell",
    headerName: "Days to sell",
    width: 130,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    cellRenderer: SlowCell,
  },
  {
    colId: "scrap_rate",
    headerName: "Scrap rate",
    width: 140,
    type: "rightAligned",
    filter: "agNumberColumnFilter",
    valueGetter: ({ data }) => (data ? data.scrap_rate * 100 : null),
    valueFormatter: ({ value }) =>
      value == null ? "" : `${Number(value).toFixed(1)}%`,
    cellStyle: ({ data }) =>
      data?.high_scrap ? { color: NEGATIVE_COLOR } : undefined,
  },
];

export default function PartsReviewView() {
  const review = useQuery({
    queryKey: ["parts", "review"],
    queryFn: () => getJson<ReviewPart[]>("/parts/review"),
  });
  const colorScheme = useComputedColorScheme("dark");

  if (review.isError) {
    return (
      <Alert color="red" title="Could not load parts to review">
        Check that the backend is running and that cleaning.py has been run.
      </Alert>
    );
  }
  if (!review.data) {
    return <Loader />;
  }

  return (
    <Stack>
      <Card withBorder>
        <Title order={4}>Parts to review</Title>
        <Text size="sm" c="dimmed">
          Each on-hand part is checked against three rules: a scrap rate of 20%
          or more (with at least 5 records), a median repair margin under 20%
          (with at least 5 sales), and over 180 days to sell (with at least 5
          dated sales). Rows are ranked by how many checks they fail and
          estimated repair cost (on-hand qty x avg unit repair cost)
        </Text>
        <Box mt="md">
          <AgGridReact<ReviewPart>
            theme={gridThemes[colorScheme]}
            rowData={review.data}
            columnDefs={columns}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
              wrapHeaderText: true,
              autoHeaderHeight: true,
            }}
            pagination
            paginationPageSize={PAGE_SIZE}
            paginationPageSizeSelector={false}
            domLayout="autoHeight"
          />
        </Box>
      </Card>
    </Stack>
  );
}
