export async function copyReviewFilePath(path: string, options: {
  writeText: (value: string) => Promise<void>
  onSuccess: (path: string) => void
  onFailure: (path: string) => void
}) {
  try {
    await options.writeText(path)
    options.onSuccess(path)
    return true
  } catch {
    options.onFailure(path)
    return false
  }
}

export const REVIEW_FILE_COPY_FEEDBACK_MS = 1500