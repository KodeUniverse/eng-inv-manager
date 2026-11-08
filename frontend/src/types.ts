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

export type ScrapPart = {
  part: string
  description: string
  scrapped: number
  total: number
  scrap_rate: number
  enough_records: boolean
}
