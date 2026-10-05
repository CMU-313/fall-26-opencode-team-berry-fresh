import { REVIEW_FILE_COPY_FEEDBACK_MS } from "./review-file-copy"

type ReviewFileCopyFeedbackOptions = {
  setCopiedPath: (path: string | undefined) => void
  schedule?: typeof setTimeout
  cancel?: typeof clearTimeout
}

export function createReviewFileCopyFeedback(options: ReviewFileCopyFeedbackOptions) {
  let timer: ReturnType<typeof setTimeout> | undefined

  const copied = (path: string) => {
    options.setCopiedPath(path)

    if (timer) {
      ;(options.cancel ?? clearTimeout)(timer)
    }

    timer = (options.schedule ?? setTimeout)(() => {
      options.setCopiedPath(undefined)
      timer = undefined
    }, REVIEW_FILE_COPY_FEEDBACK_MS)
  }

  const cleanup = () => {
    if (timer) {
      ;(options.cancel ?? clearTimeout)(timer)
      timer = undefined
    }
  }

  return {
    copied,
    cleanup,
  }
}