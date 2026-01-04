/**
 * Serializes an object for JSON, converting BigInt and Date to strings
 */
export function serialize<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    })
  );
}

