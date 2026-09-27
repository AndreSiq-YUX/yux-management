export async function awaitCurrentRadarPlacePreview<T>(
  pending: Promise<T>,
  requestKey: string,
  getCurrentKey: () => string,
): Promise<T | null> {
  const result = await pending
  return requestKey === getCurrentKey() ? result : null
}
