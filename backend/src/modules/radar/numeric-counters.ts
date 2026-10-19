// pg int8 stays a string globally. Normalize only Radar's bounded counters.
export function normalizeRadarCounters<T extends Record<string,unknown>>(row:T):T{
 if(!row)return row
 const normalized={...row}
 for(const key of ['requested_count','queries','daily_limit','rate_limit_per_day','page_size','units','pages_processed','candidates_seen']){
  if(row[key]===undefined||row[key]===null)continue
  const value=Number(row[key])
  if(!Number.isSafeInteger(value)||value<0)throw Error('radar_counter_invalid')
  Object.assign(normalized,{[key]:value})
 }
 return normalized
}
