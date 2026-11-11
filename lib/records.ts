type UnknownRecord = Record<string, unknown>;

export function toCamel<T = UnknownRecord>(value: UnknownRecord): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      item,
    ]),
  ) as T;
}

export function toCamelList<T = UnknownRecord>(rows: UnknownRecord[] | null) {
  return (rows ?? []).map((row) => toCamel<T>(row));
}
