export function createReviewFilePathWriter(
  clipboard: { writeText: (value: string) => Promise<void> },
) {
  return (value: string) => clipboard.writeText(value)
}