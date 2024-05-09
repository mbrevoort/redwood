import '@testing-library/jest-dom/vitest'

import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

afterEach(() => {
  // If vitest globals are enabled testing-library will clean up after each
  // test automatically, but we don't enable globals, so we have to manually
  // clean up here
  // https://testing-library.com/docs/react-testing-library/api/#cleanup
  cleanup()
})
