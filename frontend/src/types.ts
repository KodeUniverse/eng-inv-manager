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

export type ScrapPart = {
  part: string
  description: string
  scrapped: number
  total: number
  scrap_rate: number
  enough_records: boolean
}
