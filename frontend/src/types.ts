export type ScrapGroup = {
  name: string
  scrapped: number
  total: number
  share_of_scrap: number
  scrap_rate: number
}

export type ScrapSummary = {
  module: ScrapGroup[]
  sub_type: ScrapGroup[]
}

export type SoldPart = {
  part: string
  description: string
  module: string
  sub_type: string
  invoice_date: string
  destination_country: string
  qty: number | null
  unit_sales_price: number
  repair_unit_cost: number
  margin: number | null
  margin_note: string | null
}

export type InventoryGroup = {
  module: string
  sub_type: string
  whse: string
  condition: string
  parts: number
  qty: number | null
}

export type SellGroup = {
  name: string
  count: number
  mean_days: number
  median_days: number
  median_actual_days: number
  median_expected_days: number
}

export type SellThroughSummary = {
  module: SellGroup[]
  sub_type: SellGroup[]
}

export type ReviewPart = {
  part: string
  description: string
  module: string
  sub_type: string
  qty_on_hand: number
  sales: number
  median_margin: number | null
  avg_unit_repair_cost: number | null
  avg_unit_sales_price: number | null
  median_days_to_sell: number | null
  scrap_rate: number
  scrapped: number
  high_scrap: boolean
  weak_margin: boolean
  slow: boolean
  scrap_sampled: boolean
  margin_sampled: boolean
  days_sampled: boolean
  flags: number
  exposure: number | null
  action: string
}

export type ScrapPart = {
  part: string
  description: string
  scrapped: number
  total: number
  scrap_rate: number
  enough_records: boolean
}
